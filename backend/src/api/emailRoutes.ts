import express from 'express';
import nodemailer from 'nodemailer';

const router = express.Router();

router.post('/send', async (req, res) => {
    const { para, assunto, corpo } = req.body;
    
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587');
    
    if (!user || !pass) {
        return res.status(400).json({ success: false, error: 'Configure EMAIL_USER e EMAIL_PASS no ficheiro .env do backend.' });
    }

    try {
        const transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465, // true for 465, false for other ports
            auth: {
                user,
                pass
            }
        });

        await transporter.sendMail({
            from: `"Sistema TOP IA" <${user}>`,
            to: para,
            subject: assunto,
            text: corpo
        });

        res.json({ success: true, message: 'Email enviado com sucesso!' });
    } catch (err: any) {
        console.error('Erro ao enviar email:', err);
        res.status(500).json({ success: false, error: 'Falha ao enviar o email: ' + err.message });
    }
});

export default router;
