/**
 * Script one-off: converte o formato antigo de automações para o novo grafo
 * (nodes/edges) usado pelo builder visual estilo ManyChat.
 *
 * Pré-requisito: já ter corrido backend/migration_automation_visual_builder.sql
 * no Supabase (colunas `nodes`/`edges` precisam existir na tabela `automations`).
 *
 * Idempotente: pula automações que já tenham `nodes` preenchido, e não apaga
 * `steps`/`wa_workflows` — só lê deles para gerar as novas linhas/colunas.
 *
 * Uso: npx ts-node scripts/migrateAutomationsToGraph.ts   (a partir de backend/)
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { supabase } from '../src/lib/supabaseClient';

interface FlowNode {
    id: string;
    type: 'trigger' | 'condition' | 'action' | 'end';
    position: { x: number; y: number };
    data: any;
}

interface FlowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
}

let nodeCounter = 0;
function nextId(prefix: string): string {
    nodeCounter++;
    return `${prefix}_${nodeCounter}`;
}

function isEmptyGraph(value: any): boolean {
    if (!value) return true;
    const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    return !Array.isArray(parsed) || parsed.length === 0;
}

/**
 * Converte um array de steps[] lineares (formato antigo do Autopilot) em
 * nodes/edges. IF_CONDITION vira um nó `condition` cujo branch "no" fica sem
 * aresta de saída, replicando o comportamento atual de "aborta o resto".
 */
function convertStepsToGraph(triggerTypeRaw: string, steps: any[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    const triggerId = nextId('trigger');
    const webhookSource = String(triggerTypeRaw || '').replace(/^WEBHOOK_/i, '').toLowerCase() || 'generic';
    nodes.push({
        id: triggerId,
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: { triggerKind: 'webhook_generic', webhookSource }
    });

    let previousId = triggerId;
    let previousHandle: string | null = null;
    let y = 150;

    for (const step of steps || []) {
        if (step.type === 'IF_CONDITION') {
            const condId = nextId('cond');
            nodes.push({
                id: condId,
                type: 'condition',
                position: { x: 0, y },
                data: {
                    variable: step.config?.variavel || step.config?.variable || '',
                    operator: step.config?.operador || step.config?.operator || '==',
                    value: step.config?.valor || step.config?.value || ''
                }
            });
            edges.push({ id: nextId('edge'), source: previousId, target: condId, sourceHandle: previousHandle });
            // "no" fica sem aresta de saída — equivalente ao "aborta o resto" de hoje
            previousId = condId;
            previousHandle = 'yes';
            y += 150;
            continue;
        }

        const actionId = nextId('action');
        nodes.push({
            id: actionId,
            type: 'action',
            position: { x: 0, y },
            data: { actionType: step.type, config: step.config || {} }
        });
        edges.push({ id: nextId('edge'), source: previousId, target: actionId, sourceHandle: previousHandle });
        previousId = actionId;
        previousHandle = null;
        y += 150;
    }

    return { nodes, edges };
}

function convertWaWorkflowToGraph(wf: any): { nodes: FlowNode[]; edges: FlowEdge[] } {
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    const triggerId = nextId('trigger');
    nodes.push({
        id: triggerId,
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: {
            triggerKind: 'whatsapp_message',
            matchMode: wf.trigger_type === 'all' ? 'any' : (wf.trigger_type || 'any'),
            matchValue: wf.trigger_condition || ''
        }
    });

    let previousId = triggerId;
    let y = 150;
    const actions = Array.isArray(wf.actions) ? wf.actions : [];
    for (const action of actions) {
        if (action.type !== 'send_message') continue; // único tipo suportado hoje
        const actionId = nextId('action');
        nodes.push({
            id: actionId,
            type: 'action',
            position: { x: 0, y },
            data: { actionType: 'REPLY_MESSAGE', config: { mensagem: action.text || '' } }
        });
        edges.push({ id: nextId('edge'), source: previousId, target: actionId, sourceHandle: null });
        previousId = actionId;
        y += 150;
    }

    return { nodes, edges };
}

async function migrateAutomationsTable() {
    const { data: automations, error } = await supabase.from('automations').select('*');
    if (error) {
        console.error('Erro ao ler automations:', error);
        return { converted: 0, skipped: 0, failed: 0 };
    }

    let converted = 0, skipped = 0, failed = 0;
    for (const automation of automations || []) {
        if (!isEmptyGraph(automation.nodes)) {
            skipped++;
            continue;
        }
        const steps = typeof automation.steps === 'string' ? JSON.parse(automation.steps || '[]') : (automation.steps || []);
        if (!Array.isArray(steps) || steps.length === 0) {
            skipped++;
            continue;
        }
        try {
            const { nodes, edges } = convertStepsToGraph(automation.trigger_type, steps);
            const { error: updateErr } = await supabase.from('automations').update({
                nodes: JSON.stringify(nodes),
                edges: JSON.stringify(edges)
            }).eq('id', automation.id);
            if (updateErr) throw updateErr;
            console.log(`[automations] Migrada automação #${automation.id} (${automation.nome})`);
            converted++;
        } catch (e) {
            console.error(`[automations] Falha ao migrar #${automation.id}:`, e);
            failed++;
        }
    }
    return { converted, skipped, failed };
}

async function migrateWaWorkflowsTable() {
    const { data: workflows, error } = await supabase.from('wa_workflows').select('*');
    if (error) {
        console.error('Erro ao ler wa_workflows (pode não existir/estar acessível):', error.message);
        return { converted: 0, skipped: 0, failed: 0 };
    }

    let converted = 0, failed = 0;
    for (const wf of workflows || []) {
        try {
            const { nodes, edges } = convertWaWorkflowToGraph(wf);
            const { error: insertErr } = await supabase.from('automations').insert({
                empresa_id: wf.empresa_id || null,
                nome: `WhatsApp Auto-Resposta (migrada #${wf.id})`,
                trigger_type: 'WHATSAPP_MESSAGE',
                nodes: JSON.stringify(nodes),
                edges: JSON.stringify(edges),
                ativo: wf.is_active !== false
            });
            if (insertErr) throw insertErr;
            console.log(`[wa_workflows] Migrado workflow #${wf.id} para nova automação`);
            converted++;
        } catch (e) {
            console.error(`[wa_workflows] Falha ao migrar #${wf.id}:`, e);
            failed++;
        }
    }
    return { converted, skipped: 0, failed };
}

async function main() {
    console.log('=== Migração de automações para o formato de grafo (nodes/edges) ===');

    const automationsResult = await migrateAutomationsTable();
    const workflowsResult = await migrateWaWorkflowsTable();

    console.log('\n=== Resumo ===');
    console.log(`automations:   convertidas=${automationsResult.converted} puladas=${automationsResult.skipped} falhas=${automationsResult.failed}`);
    console.log(`wa_workflows:  migradas=${workflowsResult.converted} falhas=${workflowsResult.failed}`);
    console.log('\nConfira os resultados no builder visual antes de considerar a migração concluída.');
}

main().catch(err => {
    console.error('Erro fatal na migração:', err);
    process.exit(1);
});
