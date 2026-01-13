/* ARCHIVO: server/index.js
   Este es el cerebro que conecta con tu app.js
*/
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Configuración CORS (Vital para que Vercel hable con Render)
app.use(cors()); // Esto permite conexiones desde cualquier lugar (inseguro pero rápido para empezar)
app.use(express.json());

// 2. Base de Datos "Simulada" en un archivo JSON
// OJO SANO: En Render (Plan Gratis), este archivo se reinicia cada vez que el servidor "duerme".
// Para producción real necesitarás conectar esto a MongoDB Atlas (que también es gratis).
const DB_FILE = path.join(__dirname, 'db.json');

// Inicializar DB si no existe
if (!fs.existsSync(DB_FILE)) {
    const initialData = {
        users: [{ username: 'sano4D', password: '123', role: 'administrador' }],
        almacenData: {},
        reportOptions: { sede: [], equipo: [], especificacion: [], metodoPago: [] },
        registros: { garantias: [], facturas: [] },
        pendingOrders: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

// Función auxiliar para leer/escribir
const readDB = () => JSON.parse(fs.readFileSync(DB_FILE));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// --- RUTAS QUE PIDE TU APP.JS ---

// 1. LOGIN
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.username === username && u.password === password);
    
    if (user) {
        res.json({ username: user.username, role: user.role });
    } else {
        res.status(401).json({ error: 'Credenciales inválidas' });
    }
});

// 2. REGISTRO DE USUARIOS
app.post('/users', (req, res) => {
    const { username, password, role } = req.body;
    const db = readDB();
    
    if (db.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'El usuario ya existe' });
    }
    
    db.users.push({ username, password, role });
    writeDB(db);
    res.json({ message: 'Usuario creado' });
});

// 3. CARGA INICIAL DE DATOS
app.get('/initial-data', (req, res) => {
    const db = readDB();
    res.json({
        almacenData: db.almacenData,
        reportOptions: db.reportOptions,
        pendingOrders: db.pendingOrders
    });
});

// 4. GUARDAR REGISTROS (Facturas/Garantías)
app.post('/registros/:tipo', (req, res) => {
    const { tipo } = req.params; // 'factura' o 'garantia'
    const nuevoRegistro = req.body;
    const db = readDB();
    
    // Convertir singular a plural para la clave de la DB
    const key = tipo === 'factura' ? 'facturas' : 'garantias';
    
    if (!db.registros[key]) db.registros[key] = [];
    db.registros[key].push(nuevoRegistro);
    
    // Actualizar Stock si es Factura
    if (tipo === 'factura' && nuevoRegistro.productos) {
        nuevoRegistro.productos.forEach(prod => {
            if(prod.codigo && prod.codigo !== 'N/A') {
                const sede = nuevoRegistro.sedeFacturacion;
                if(db.almacenData[sede]) {
                    const pAlmacen = db.almacenData[sede].productos.find(p => p.codigo === prod.codigo);
                    if(pAlmacen) {
                        pAlmacen.stock -= prod.cantidad;
                    }
                }
            }
        });
    }

    writeDB(db);
    res.json({ message: 'Guardado exitosamente' });
});

// 5. LEER REGISTROS (Buzón)
app.get('/registros/:tipo', (req, res) => {
    const { tipo } = req.params; // garantias o facturas
    const { sede } = req.query;
    const db = readDB();
    
    let resultados = db.registros[tipo] || [];
    if (sede && sede !== 'Todas') {
        resultados = resultados.filter(r => r.sedeFacturacion === sede);
    }
    res.json(resultados);
});

// 6. GESTIÓN ALMACÉN (Crear Productos)
app.post('/almacen/:sede/productos', (req, res) => {
    const { sede } = req.params;
    const producto = req.body;
    const db = readDB();

    if (!db.almacenData[sede]) {
        db.almacenData[sede] = { nombre: sede, productos: [] };
    }

    const prodExistente = db.almacenData[sede].productos.find(p => p.codigo === producto.codigo);
    if (prodExistente) {
        Object.assign(prodExistente, producto);
    } else {
        db.almacenData[sede].productos.push(producto);
    }

    writeDB(db);
    res.json({ message: 'Producto guardado' });
});

// 7. ELIMINAR REGISTROS
app.delete('/registros/:tipo/:id', (req, res) => {
    const { tipo, id } = req.params;
    const db = readDB();
    // Convertir ID a número porque viene como string del params
    const idNum = Number(id);
    
    if (db.registros[tipo]) {
        db.registros[tipo] = db.registros[tipo].filter(r => r.id !== idNum);
        writeDB(db);
        res.json({ message: 'Eliminado' });
    } else {
        res.status(404).json({ error: 'No encontrado' });
    }
});

// 8. OPCIONES DE INFORMES
app.post('/options', (req, res) => {
    const options = req.body;
    const db = readDB();
    db.reportOptions = options;
    writeDB(db);
    res.json({ message: 'Opciones actualizadas' });
});

// Arrancar servidor
app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en puerto ${PORT}`);
});