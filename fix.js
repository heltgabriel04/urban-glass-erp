const fs = require('fs');
fs.writeFileSync('app/orcamentos/page.tsx', fs.readFileSync('app/orcamentos/page.tsx.new', 'utf8'));
console.log('Feito!');