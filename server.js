const express = require('express');
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const hasher = require('wordpress-hash-node');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 8760;

app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

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
        // Contraseña correcta, realizar la consulta adicional a cdx_usermeta
        db.query('SELECT meta_value FROM cdx_usermeta WHERE user_id = ? AND meta_key = ?', [user.ID, 'cdx_user_level'], async (error, metaResults) => {
          if (error) {
            console.log(error);
            res.status(500).send('Error en el servidor');
          } else {
            const userLevel = metaResults.length > 0 ? metaResults[0].meta_value : null;

            // Verificar la suscripción del usuario en cdx_pms_member_subscriptions
            db.query('SELECT * FROM cdx_pms_member_subscriptions WHERE user_id = ?', [user.ID], async (error, subscriptionResults) => {
              if (error) {
                console.log(error);
                res.status(500).send('Error en el servidor');
              } else {
                const validPlans = [3865, 601, 18568];
                let hasValidSubscription = false;
                let expirationDate = null;

                for (const subscription of subscriptionResults) {
                  if (validPlans.includes(subscription.subscription_plan_id) && subscription.status === 'active') {
                    hasValidSubscription = true;
                    expirationDate = subscription.expiration_date;
                    break;
                  }
                }

                if (!hasValidSubscription) {
                  if (subscriptionResults.length === 0 || !validPlans.includes(subscriptionResults[0].subscription_plan_id)) {
                    res.status(403).send('Su suscripción actual de Codex no le da acceso a la plataforma.');
                  } else if (subscriptionResults[0].status !== 'active') {
                    res.status(403).send('Su suscripción ha expirado.');
                  } else {
                    res.status(403).send('No tiene una suscripción registrada en Codex.');
                  }
                } else {
                  // Generar el token JWT incluyendo el nivel de usuario y la fecha de expiración de la suscripción
                  const token = jwt.sign({
                    userId: user.ID,
                    userName: user.display_name,
                    userLevel: userLevel,
                    expirationDate: expirationDate
                  }, 'secreto_del_token');

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
                }
              }
            });
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
  return new Date().getFullYear() - 1;
}

// Función para obtener el año anterior
function getPreviousYear() {
  return new Date().getFullYear() - 2;
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
    req.userLevel = decoded.userLevel;
    req.expirationDate = decoded.expirationDate;
    next();
  });
};


// Función de verificación en la ruta protegida
app.get('/api/data', verifyToken, (req, res) => {
  const userId = req.userId;
  const userName = req.userName;
  const userLevel = req.userLevel;

  // Consultar la base de datos para verificar si ciasData está vacío para el usuario
  const sql = 'SELECT * FROM cdx_txt WHERE user_id = ?';
  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error('Error al obtener datos de la base de datos:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    if (result.length === 0) {
      // No se encontraron filas para el usuario
      return res.status(404).json({ error: 'No se encontraron datos para el usuario' });
    }

    const expirationDate = new Date(req.expirationDate);
    const currentDate = new Date();

    if (expirationDate < currentDate) {
      return res.status(403).json({ valid: false, message: 'Su suscripción ha expirado.' });
    }

    const userRow = result[0];

    res.json({ userId, userName, userLevel, userRow });
  });
});

// ************* Endpoint para la actualización ************* //

app.put('/api/update', (req, res) => {
  const { data, dataName, userId } = req.body;

  // Validar que los parámetros requeridos estén presentes
  if (!data || !dataName || !userId) {
    return res.status(400).send('Parámetros faltantes');
  }

  // Esto es importante para prevenir ataques de inyección de SQL
  const allowedFields = ['originalData', 'ciasData', 'sriData', 'selecciones', 'saldoECP', 'saldoEFE', 'saldoEFEDirecto', 'personalData', 'downloads', 'rawMapping', 'cuentasASeleccionar'];
  if (!allowedFields.includes(dataName)) {
    return res.status(400).send('Nombre de campo no válido');
  }

  // Serializar los nuevos datos a formato JSON
  const newDataSerializada = JSON.stringify(data);

  // Construir y ejecutar la consulta SQL
  const sql = `UPDATE cdx_txt SET ${dataName} = ? WHERE user_id = ?`;
  db.query(sql, [newDataSerializada, userId], (err, result) => {
    if (err) {
      console.error('Error al actualizar datos: ' + err.message);
      return res.status(500).send('Error interno del servidor');
    }
    // Verificar si se actualizó alguna fila
    if (result.affectedRows === 0) {
      console.log(`No se encontró el usuario con ID ${userId}`);
      return res.status(404).send('Usuario no encontrado');
    }
    // console.log(`Datos actualizados correctamente en ${dataName} para el usuario ID ${userId}`);
    res.send('Datos actualizados correctamente');
  });
});



// ************* Puerto ************* //

app.listen(8760, () => {
  console.log(`Servidor Express corriendo en el puerto ${PORT}`);
});
