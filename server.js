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
let dbConfig;

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

console.log(process.env.NODE_ENV);

if (process.env.NODE_ENV === 'development') {
  // Configuración para entorno de desarrollo
  dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'codex_txt'
  };
} else {
  // Configuración para otros entornos (por ejemplo, producción)
  dbConfig = {
    host: 'localhost',
    user: 'asesunnr_cdx',
    password: 'p49)iXS17@',
    database: 'asesunnr_cdx'
  };
}

const db = mysql.createConnection(dbConfig);

db.connect(err => {
  if (err) {
    throw err;
  }
  console.log('Conexión a la base de datos establecida');
});

app.get('/', (req, res) => {
  res.send('Servidor en línea');
});

// ************* Endpoint para el inicio de sesión y creación de tabla ************* //

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
      let isPasswordCorrect;

      if (process.env.NODE_ENV === 'development') {
        isPasswordCorrect = (password === user.user_pass);
      } else {
        isPasswordCorrect = hasher.CheckPassword(password, user.user_pass);
      }

      if (isPasswordCorrect) {
        // Contraseña correcta, generar y devolver el token JWT
        const token = jwt.sign({ userId: user.ID, userName: user.display_name }, 'secreto_del_token');

        // Verificar si existe una fila en la tabla cdx_txt para el usuario
        db.query('SELECT * FROM cdx_txt WHERE user_id = ?', [user.ID], async (error, results) => {
          if (error) {
            console.log(error);
            res.status(500).send('Error en el servidor');
          } else if (results.length === 0) {
            // Si no existe una fila, crear una nueva fila en la tabla
            db.query(
              'INSERT INTO cdx_txt (user_id, yearCurrent, yearPrevious, downloads) VALUES (?, ?, ?, ?)',
              [user.ID, getCurrentYear(), getPreviousYear(), JSON.stringify({
                situacion: 0,
                resultados: 0,
                patrimonio: 0,
                efectivo: 0
              })],
              (error, result) => {
                if (error) {
                  console.log(error);
                  res.status(500).send('Error en el servidor');
                } else {
                  console.log('Nueva fila creada en cdx_txt para el usuario:', user.ID);
                  res.json({ token });
                }
              }
            );
          } else {
            // Si ya existe una fila, devolver el token sin crear una nueva fila
            res.json({ token });
          }
        });
      } else {
        res.status(401).send('Contraseña incorrecta');
      }
    }
  });
});

// Función para obtener el año actual
function getCurrentYear() {
  return new Date().getFullYear();
}

// Función para obtener el año anterior
function getPreviousYear() {
  return new Date().getFullYear() - 1;
}



// ************* Endpoint para el retorno de información con token ************* //

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) return res.status(401).json({ message: 'No hay token proporcionado' });

  jwt.verify(token.split(' ')[1], 'secreto_del_token', (err, decoded) => {
    if (err) {
      console.error('Error al verificar el token:', err);
      return res.status(403).json({ message: 'Token inválido' });
    }
    req.userId = decoded.userId;
    req.userName = decoded.userName;
    next();
  });
};


// Ejemplo de cómo utilizar la función de verificación en una ruta protegida
app.get('/api/data', verifyToken, (req, res) => {
  const userId = req.userId;
  const userName = req.userName;

  res.json({ userId, userName });
});



// ************* Puerto ************* //

app.listen(8760, () => {
  console.log(`Servidor Express corriendo en el puerto ${PORT}`);
});
