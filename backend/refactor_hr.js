const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'controllers', 'hrController.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace PayrollService calls
content = content.replace(/PayrollService\.calcularSalario\(/g, 'PayrollService.calcularSalario(');
content = content.replace(/PayrollService\.processarLoteDB\(/g, 'await PayrollService.processarLoteDB(req, ');

// Replace EmployeeService calls
content = content.replace(/EmployeeService\.seedDummyEmployee\(\)/g, 'await EmployeeService.seedDummyEmployee(req)');
content = content.replace(/EmployeeService\.getAllEmployees\(\)/g, 'await EmployeeService.getAllEmployees(req)');
content = content.replace(/EmployeeService\.createEmployee\(/g, 'await EmployeeService.createEmployee(req, ');
content = content.replace(/EmployeeService\.gerarDeclaracaoServico\(/g, 'await EmployeeService.gerarDeclaracaoServico(req, ');
content = content.replace(/EmployeeService\.deleteEmployee\(/g, 'await EmployeeService.deleteEmployee(req, ');
content = content.replace(/EmployeeService\.deleteDepartamento\(/g, 'await EmployeeService.deleteDepartamento(req, ');
content = content.replace(/EmployeeService\.processarSalarios\(/g, 'await EmployeeService.processarSalarios(req, ');
content = content.replace(/EmployeeService\.getProcessamento\(/g, 'await EmployeeService.getProcessamento(req, ');
content = content.replace(/EmployeeService\.gerarReciboPdf\(/g, 'await EmployeeService.gerarReciboPdf(req, ');
content = content.replace(/EmployeeService\.registrarAusencia\(/g, 'await EmployeeService.registrarAusencia(req, ');
content = content.replace(/EmployeeService\.listarDepartamentos\(\)/g, 'await EmployeeService.listarDepartamentos(req)');

// Add await where missing (e.g. for functions that didn't have await previously)
content = content.replace(/const loteId = await EmployeeService\.processarSalarios/g, 'const loteId = await EmployeeService.processarSalarios');
content = content.replace(/const dados = await EmployeeService\.getProcessamento/g, 'const dados = await EmployeeService.getProcessamento');
content = content.replace(/const pdfPath = await EmployeeService\.gerarReciboPdf/g, 'const pdfPath = await EmployeeService.gerarReciboPdf');

fs.writeFileSync(filePath, content);
console.log('hrController.ts refactored');
