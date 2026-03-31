export const INITIAL_DATA = [
  { id: '00A0041', desc: 'DEFLATING VALVE SEAT', cost: 33.37, warehouse: 'ALM-CUU', stock: 7, reserved: 0, available: 7, totalCost: 233.59 },
  { id: '00A0044', desc: 'DEFLATING VALVE', cost: 32.49, warehouse: 'ALM-CUU', stock: 8, reserved: 0, available: 8, totalCost: 259.92 },
  { id: '00A0090', desc: 'BOLT', cost: 23.37, warehouse: 'ALM-CUU', stock: 1, reserved: 0, available: 1, totalCost: 23.37 },
  { id: '00A0519', desc: 'CONNECTOR', cost: 84.98, warehouse: 'ALM-CUU', stock: 1, reserved: 0, available: 1, totalCost: 84.98 },
  { id: '00A3395', desc: 'CONNECTOR;CHSTL 35', cost: 132.66, warehouse: 'ALM-CUU', stock: 2, reserved: 2, available: 0, totalCost: 0 },
  { id: 'SP215258', desc: 'UNION SCREW', cost: 1669.65, warehouse: 'ALM-CUU', stock: 1, reserved: 0, available: 1, totalCost: 1669.65 },
  { id: 'SP219475', desc: 'start the motor', cost: 2244.06, warehouse: 'ALM-CUU', stock: 5, reserved: 0, available: 5, totalCost: 11220.3 },
  { id: 'SP225436', desc: 'Expansion valve', cost: 171.48, warehouse: 'ALM-CUU', stock: 3, reserved: 0, available: 3, totalCost: 514.44 },
  { id: 'SP240380', desc: 'GENERAL SEAL KIT: MAIN PUMP', cost: 29503.14, warehouse: 'ALM-CUU', stock: 1, reserved: 0, available: 1, totalCost: 29503.14 },
  { id: 'SP226377', desc: 'fan bracket', cost: 1898.84, warehouse: 'ALM-CUU', stock: 3, reserved: 0, available: 3, totalCost: 5696.52 },
];

export const INITIAL_ORDERS = [];

export const SYSTEM_USERS = [
  { username: 'jarmendariz', name: 'Javier Armendariz', role: 'Tecnico', password: 'JAliumaq26' },
  { username: 'jgonzalez', name: 'Jorge Gonzalez', role: 'Tecnico', password: 'JGliumaq26' },
  { username: 'asanchez', name: 'Noel Sanchez', role: 'Tecnico', password: 'ASliumaq26' },
  { username: 'dhernandez', name: 'Daniel Hernandez', role: 'Tecnico', password: 'DHliumaq26' },
  { username: 'operez', name: 'Oscar Perez', role: 'Tecnico', password: 'OPliumaq26' },
  { username: 'rmendoza', name: 'Raymundo Mendoza', role: 'Tecnico', password: 'RMliumaq26' },
  { username: 'jagonzalez', name: 'Jorge Arturo Gonzalez', role: 'Tecnico', password: 'JAGliumaq26' },
  { username: 'ereyes', name: 'Eduardo Reyes', role: 'Tecnico', password: 'ERliumaq26' },
  { username: 'dorona', name: 'Daniel Orona', role: 'Tecnico', password: 'DOliumaq26' },
  { username: 'amendez', name: 'Alfonso Mendez', role: 'Tecnico', password: 'AMliumaq26' },
  { username: 'dgonzalez', name: 'Daniel Gonzalez', role: 'Tecnico', password: 'DGliumaq26' },
  { username: 'jtalamantes', name: 'Jose Talamantes', role: 'Tecnico', password: 'JTliumaq26' },
  { username: 'jgarcia', name: 'Jose Alberto Garcia', role: 'Tecnico', password: 'JGliumaq26' },
  { username: 'gpalvarado', name: 'Gerardo Alvarado', role: 'Tecnico', password: 'GPAliumaq26' },
  { username: 'uaguirre', name: 'Ulisses Aguirre', role: 'Tecnico', password: 'UAliumaq26' },
  { username: 'ahernandez', name: 'Aaron Hernandez', role: 'Tecnico', password: 'AHliumaq26' },
  { username: 'lfuentes', name: 'Luis Fuentes', role: 'Administrador', password: 'LFliumaq26' },
  { username: 'rmadrid', name: 'Ricardo Madrid', role: 'Administrador/Tecnico', password: 'RMliumaq26' },
  { username: 'lsolis', name: 'L Solis', role: 'Administrador/Tecnico', password: 'Ares1209' },
];

export const ORDER_FULFILLMENT_USERS = new Set(['kdaniel', 'rmadrid', 'lsolis', 'lfuentes']);

export const CLIENTS = [
  'GCC',
  'CIENEGUITA',
  'MINA "LOS GATOS"',
  'GOBIERNO DEL ESTADO DE CHIHUAHUA',
  'JMAS',
  'INTERCERAMIC',
];

export const CLIENT_SLA_HOURS = {
  GCC: 24,
  CIENEGUITA: 36,
  'MINA "LOS GATOS"': 24,
  'GOBIERNO DEL ESTADO DE CHIHUAHUA': 48,
  JMAS: 24,
  INTERCERAMIC: 36,
};
