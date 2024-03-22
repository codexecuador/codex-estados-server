const express = require('express');
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const hasher = require('wordpress-hash-node');
const cors = require('cors');

const app = express();
const PORT = 8760;

app.use(express.json());
app.use(cors());

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
      res.status(500).send('Error en el servidor');
    } else if (results.length === 0) {
      res.status(401).send('Usuario no encontrado');
    } else {
      const user = results[0];
      const isPasswordCorrect = hasher.CheckPassword(password, user.user_pass);

      if (isPasswordCorrect) {
        // Contraseña correcta, generar y devolver el token JWT
        const token = jwt.sign({ userId: user.id }, 'secreto_del_token');
        res.json({ token });
      } else {
        res.status(401).send('Contraseña incorrecta');
      }
    }
  });
});

app.listen(8760, () => {
  console.log(`Servidor Express corriendo en el puerto ${PORT}`);
});
