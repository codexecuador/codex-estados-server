const express = require('express');
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const cors = require('cors'); // Importa el módulo cors

const app = express();
const PORT = 8760;

app.use(express.json());
app.use(cors()); // Habilita CORS para todas las solicitudes

// Configurar la conexión a la base de datos
const db = mysql.createConnection({
  host: 'localhost',
  user: 'asesunnr_cdx',
  password: 'p49)iXS17@',
  database: 'asesunnr_cdx'
});

db.connect(err => {
  if (err) {
    throw err;
  }
  console.log('Conexión a la base de datos establecida');
});

app.get('/', (req, res) => {
  res.send('Hello world');
});


// Endpoint para el inicio de sesión
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Verificar si el usuario existe en la base de datos
  db.query('SELECT * FROM cdx_users WHERE user_login = ?', [username], async (error, results) => {
    if (error) {
      console.log(error);
      res.status(500).send('Error en el servidor' + error);
    } else if (results.length === 0) {
      res.status(401).send('Credenciales inválidas');
    } else {
      const user = results[0];
      res.status(401).send('Credenciales inválidas' + user);
      // Aquí puedes continuar con la lógica para generar y devolver el token JWT
    }
  });
});

app.listen(8760, () => {
  console.log(`Servidor Express corriendo en el puerto ${PORT}`);
});

