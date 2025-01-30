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

// ************* Endpoint para la creación de un usuario ************* //

app.post('/create-user', (req, res) => {
  const { user_login, user_pass, user_nicename, user_email } = req.body;

  if (!user_login || !user_pass || !user_nicename || !user_email) {
    return res.status(400).send('Parámetros faltantes');
  }

  // Verificar si ya existe el usuario o el correo
  const checkUserSql = 'SELECT ID FROM cdx_users WHERE user_login = ? OR user_email = ?';
  db.query(checkUserSql, [user_login, user_email], (err, results) => {
    if (err) {
      console.error('Error al verificar usuario:', err.message);
      return res.status(500).send('Error interno del servidor');
    }

    if (results.length > 0) {
      return res.status(400).send('El usuario o el correo ya existen');
    }

    // Hashear la contraseña
    const hashedPassword = hasher.HashPassword(user_pass);

    // Insertar en cdx_users
    const insertUserSql = `
      INSERT INTO cdx_users (user_login, user_pass, user_nicename, user_email, user_registered, user_status, display_name)
      VALUES (?, ?, ?, ?, NOW(), 0, ?)`;
    db.query(insertUserSql, [user_login, hashedPassword, user_nicename, user_email, user_nicename], (err, result) => {
      if (err) {
        console.error('Error al insertar usuario:', err.message);
        return res.status(500).send('Error interno del servidor');
      }

      const newUserId = result.insertId;

      // Insertar en cdx_txt_enterprises
      const insertEnterpriseSql = 'INSERT INTO cdx_txt_enterprises (user_id, enterprises) VALUES (?, 0)';
      db.query(insertEnterpriseSql, [newUserId], (err) => {
        if (err) {
          console.error('Error al insertar en cdx_txt_enterprises: ' + err.message);
          return res.status(500).send('Error interno del servidor');
        }
      });

      // Insertar en cdx_usermeta
      const usermetaValues = [
        [newUserId, 'cdx_capabilities', 'a:1:{s:10:"subscriber";b:1;}'],
        [newUserId, 'cdx_user_level', '0']
      ];
      const insertUsermetaSql = 'INSERT INTO cdx_usermeta (user_id, meta_key, meta_value) VALUES ?';
      db.query(insertUsermetaSql, [usermetaValues], (err) => {
        if (err) {
          console.error('Error al insertar usermeta:', err.message);
          return res.status(500).send('Error interno del servidor');
        }

        // Insertar en cdx_pms_member_subscriptions
        const expirationDate = new Date();
        expirationDate.setFullYear(expirationDate.getFullYear() + 1);

        const insertSubscriptionSql = `
          INSERT INTO cdx_pms_member_subscriptions (user_id, subscription_plan_id, start_date, expiration_date, status)
          VALUES (?, 18568, NOW(), ?, 'active')`;
        db.query(insertSubscriptionSql, [newUserId, expirationDate.toISOString().slice(0, 10)], (err) => {
          if (err) {
            console.error('Error al insertar suscripción:', err.message);
            return res.status(500).send('Error interno del servidor');
          }

          res.status(201).send('Usuario creado exitosamente');
        });
      });
    });
  });
});

// ************* Endpoint para el inicio de sesión************* //

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Verificar si el usuario existe en la base de datos
  db.query('SELECT * FROM cdx_users WHERE user_login = ?', [username], async (error, results) => {

    if (error) { // Caso en el que no se pueda conectar con la base de datos
      res.status(500).send('Error en el servidor');
    } else if (results.length === 0) { // Caso en el que no se encuentra un usuario con ese nombre
      res.status(401).send('Usuario no encontrado');
    } else { // Caso en el que sí se encuentra un usuario con ese nombre
      const user = results[0];

      // Chequeo de la contraseña
      const isPasswordCorrect = hasher.CheckPassword(password, user.user_pass);

      if (isPasswordCorrect) {
        // Contraseña correcta, realizar la consulta adicional a cdx_usermeta para obtener el nivel de usuario
        db.query('SELECT meta_value FROM cdx_usermeta WHERE user_id = ? AND meta_key = ?', [user.ID, 'cdx_user_level'], async (error, metaResults) => {
          if (error) {
            res.status(500).send('Error en el servidor');
          } else {
            const userLevel = metaResults.length > 0 ? metaResults[0].meta_value : null;

            // Generación del token JWT
            const token = jwt.sign({
              userId: user.ID,
              userName: user.display_name,
              userLevel: userLevel
            }, 'secreto_del_token');

            res.json({ token });
          }
        });
      } else {
        // Caso en el que la contraseña no coincida
        res.status(401).send('Contraseña incorrecta');
      }
    }
  });
});

// ************* Función para decriptar un token ************* //

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) return res.status(401).json({ message: 'No hay token proporcionado' });

  jwt.verify(token.split(' ')[1], 'secreto_del_token', (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Token inválido' });
    }
    req.userId = decoded.userId;
    req.userName = decoded.userName;
    req.userLevel = decoded.userLevel;
    req.expirationDate = decoded.expirationDate;
    next();
  });
};

// ************* Endpoint para la creación de nueva empresa (CREATE) ************* //

app.post('/api/create', verifyToken, (req, res) => {
  const { yearCurrent, yearPrevious, personalData } = req.body;
  const userId = req.userId;

  // Validar que los parámetros requeridos estén presentes
  if (!yearCurrent || !yearPrevious || !personalData) {
    return res.status(400).send('Parámetros faltantes');
  }

  // Consulta para obtener el límite base de empresas que puede crear el usuario
  const checkEnterpriseSql = 'SELECT enterprises FROM cdx_txt_enterprises WHERE user_id = ?';
  db.query(checkEnterpriseSql, [userId], (err, results) => {
    if (err) {
      console.error('Error al verificar cdx_txt_enterprises: ' + err.message);
      return res.status(500).send('Error interno del servidor');
    }

    const enterpriseLimit = results[0].enterprises;

    // Consulta para obtener el plan de suscripción del usuario
    const checkSubscriptionSql = 'SELECT * FROM cdx_pms_member_subscriptions WHERE user_id = ?';
    db.query(checkSubscriptionSql, [userId], (err, subscriptionResults) => {
      if (err) {
        console.error('Error al verificar cdx_pms_member_subscriptions: ' + err.message);
        return res.status(500).send('Error interno del servidor');
      }

      // Determinar la cantidad de empresas adicionales según el plan de suscripción
      let extraEnterprises = 0;
      const currentPlan = subscriptionResults[0]?.subscription_plan_id || 0;
      const planStatus = subscriptionResults[0]?.status || 'inactive';

      switch (currentPlan) {
        case 3865:
        case 601:
          extraEnterprises = 3;
          break;
        case 4737:
          extraEnterprises = 1;
          break;
      }

      // Si el plan no está activo, no se otorgan empresas adicionales
      if (planStatus !== 'active') {
        extraEnterprises = 0;
      }

      // Sumar las empresas adicionales al límite base
      const totalEnterpriseLimit = enterpriseLimit + extraEnterprises;

      // Llamar a la función para verificar y crear los datos
      verificarYCrearDatos(totalEnterpriseLimit);
    });
  });

  // Función para verificar el número de entradas y crear datos si es posible
  function verificarYCrearDatos(enterpriseLimit) {
    const checkSql = 'SELECT COUNT(*) AS count FROM cdx_txt WHERE user_id = ?';
    db.query(checkSql, [userId], (err, results) => {
      if (err) {
        console.error('Error al verificar el número de entradas: ' + err.message);
        return res.status(500).send('Error interno del servidor');
      }

      const count = results[0].count;
      if (count >= enterpriseLimit) {
        return res.status(403).send('No se pueden crear más datos porque se alcanzó el límite.');
      }

      // Serializar los datos para la inserción en la base de datos
      const personalDataSerialized = JSON.stringify(personalData);
      const downloadsSerialized = JSON.stringify({
        situacion: 0,
        resultados: 0,
        patrimonio: 0,
        efectivo: 0
      });

      // Insertar los datos en la tabla cdx_txt
      const insertSql = 'INSERT INTO cdx_txt (user_id, yearCurrent, yearPrevious, personalData, downloads) VALUES (?, ?, ?, ?, ?)';
      db.query(insertSql, [userId, yearCurrent, yearPrevious, personalDataSerialized, downloadsSerialized], (err) => {
        if (err) {
          console.error('Error al crear datos: ' + err.message);
          return res.status(500).send('Error interno del servidor');
        }
        res.status(201).send('Datos creados correctamente');
      });
    });
  }
});


// ************* Endpoint para el retorno de la data de un usuario (READ) ************* //

app.get('/api/data', verifyToken, (req, res) => {
  const userId = req.userId;
  const dataId = req.query.dataId;

  if (!dataId) {
    return res.status(400).json({ error: 'Parámetro dataId faltante' });
  }

  const sql = 'SELECT * FROM cdx_txt WHERE user_id = ? AND ID = ?';
  db.query(sql, [userId, dataId], (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    if (result.length === 0) {
      return res.status(404).json({ error: 'Datos no encontrados' });
    }

    const expirationDate = new Date(req.expirationDate);
    const currentDate = new Date();

    if (expirationDate < currentDate) {
      return res.status(403).json({ valid: false, message: 'Su suscripción ha expirado.' });
    }

    const userRow = result[0];

    res.json({ userRow });
  });
});

// ************* Endpoint para obtener la información de todos los usuarios ************* //

app.get('/api/all-users', verifyToken, (req, res) => {
  let { page, limit, search } = req.query;

  page = parseInt(page, 10);
  limit = parseInt(limit, 10);

  if (isNaN(page) || isNaN(limit) || page <= 0 || limit <= 0) {
    return res.status(400).json({ error: 'Parámetros de paginación inválidos' });
  }

  const offset = (page - 1) * limit;
  const isEmailSearch = search && /\S+@\S+\.\S+/.test(search); // Detecta si es un correo electrónico
  const searchPattern = `%${search ? search.trim() : ''}%`;

  const userInfoQuery = `
    SELECT 
      cdx_users.ID, 
      cdx_users.user_login, 
      cdx_users.display_name, 
      cdx_users.user_email,
      IFNULL(cdx_txt_enterprises.enterprises, 0) AS enterprises
    FROM cdx_users
    LEFT JOIN cdx_txt_enterprises ON cdx_users.ID = cdx_txt_enterprises.user_id
    WHERE ${isEmailSearch ? 'cdx_users.user_email' : 'cdx_users.user_login'} LIKE ?
    LIMIT ? OFFSET ?
  `;

  db.query(userInfoQuery, [searchPattern, limit, offset], (err, userInfoResult) => {
    if (err) {
      console.error('Error al obtener información del usuario:', err);
      return res.status(500).json({ error: 'Error interno al obtener información del usuario' });
    }

    const totalQuery = `
      SELECT COUNT(*) AS total
      FROM cdx_users
      WHERE ${isEmailSearch ? 'user_email' : 'user_login'} LIKE ?
    `;

    db.query(totalQuery, [searchPattern], (err, totalResult) => {
      if (err) {
        console.error('Error al contar usuarios:', err);
        return res.status(500).json({ error: 'Error interno al contar usuarios' });
      }

      res.status(200).json({
        page,
        limit,
        total: totalResult[0].total,
        users: userInfoResult,
      });
    });
  });
});

// ************* Endpoint para obtener la información general de un usuario, con fines administrativos  ************* //

app.get('/api/user-data/:id', verifyToken, (req, res) => {
  const userId = req.params.id;

  const userQuery = `
    SELECT 
      ID AS id, 
      user_login, 
      user_email, 
      display_name, 
      user_registered 
    FROM cdx_users 
    WHERE ID = ?
  `;

  const personalDataQuery = `
  SELECT 
    ID, 
    personalData 
  FROM cdx_txt 
  WHERE user_id = ?
`;


  const paymentsQuery = `
    SELECT * 
    FROM cdx_txt_payments 
    WHERE user_id = ?
  `;

  const enterpriseQuery = `
    SELECT * 
    FROM cdx_txt_enterprises 
    WHERE user_id = ?
  `;

  const subscriptionQuery = `
    SELECT 
      subscription_plan_id, 
      status 
    FROM cdx_pms_member_subscriptions 
    WHERE user_id = ?
  `;

  db.query(userQuery, [userId], (err, userResult) => {
    if (err) {
      console.error('Error al obtener usuario:', err);
      return res.status(500).json({ error: 'Error interno al obtener usuario' });
    }

    if (userResult.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = userResult[0];

    db.query(personalDataQuery, [userId], (err, personalDataResult) => {
      if (err) {
        console.error('Error al obtener datos personales:', err);
        return res.status(500).json({ error: 'Error interno al obtener datos personales' });
      }

      const personalData = personalDataResult;

      db.query(paymentsQuery, [userId], (err, paymentsResult) => {
        if (err) {
          console.error('Error al obtener pagos:', err);
          return res.status(500).json({ error: 'Error interno al obtener pagos' });
        }

        db.query(enterpriseQuery, [userId], (err, enterpriseResult) => {
          if (err) {
            console.error('Error al obtener empresa:', err);
            return res.status(500).json({ error: 'Error interno al obtener empresa' });
          }

          const enterprise = (enterpriseResult && enterpriseResult[0]?.enterprises) || 0;

          db.query(subscriptionQuery, [userId], (err, subscriptionResult) => {
            if (err) {
              console.error('Error al obtener suscripción:', err);
              return res.status(500).json({ error: 'Error interno al obtener suscripción' });
            }

            const subscription = subscriptionResult.map(({ subscription_plan_id, status }) => ({
              subscription_plan_id,
              status
            }));

            res.status(200).json({
              user,
              personalData,
              payments: paymentsResult,
              enterprise,
              subscription
            });
          });
        });
      });
    });
  });
});


// ************* Endpoint para obtener todos los resultados de un usuario ************* //

app.get('/api/all-data', verifyToken, (req, res) => {
  const userId = req.userId;
  const userName = req.userName;
  const userLevel = req.userLevel;

  let extraEnterprises = 0;

  const sqlUserData = 'SELECT ID, yearCurrent, personalData FROM cdx_txt WHERE user_id = ?';
  const sqlEnterprise = 'SELECT enterprises FROM cdx_txt_enterprises WHERE user_id = ?';
  const sqlInsertEnterprise = 'INSERT INTO cdx_txt_enterprises (user_id, enterprises) VALUES (?, ?)';
  const sqlSuscription = 'SELECT * FROM cdx_pms_member_subscriptions WHERE user_id = ?';

  // Consultar los datos del usuario
  db.query(sqlUserData, [userId], (err, userData) => {
    if (err) {
      console.error('Error al obtener datos del usuario: ' + err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    // Verificar la suscripción del usuario en cdx_pms_member_subscriptions
    db.query(sqlSuscription, [userId], async (error, subscriptionResults) => {
      if (error) {
        console.error('Error al obtener datos de suscripción: ' + error.message);
        return res.status(500).send('Error al obtener datos de suscripción');
      }

      const currentPlan = subscriptionResults[0]?.subscription_plan_id || 0;
      const planStatus = subscriptionResults[0]?.status || 'inactive'; // 18568 Plan Super TXT

      switch (currentPlan) {
        case 3865:
          extraEnterprises = 3;
          break;
        case 601:
          extraEnterprises = 3;
          break;
        case 4737:
          extraEnterprises = 1;
          break;
      }

      if (planStatus !== 'active') {
        extraEnterprises = 0;
      }
    });

    // Verificar y crear el registro en cdx_txt_enterprises si no existe
    db.query(sqlEnterprise, [userId], (err, enterpriseData) => {
      if (err) {
        console.error('Error al verificar enterprises: ' + err.message);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }

      if (enterpriseData.length === 0) {
        // Crear registro en cdx_txt_enterprises si no existe
        db.query(sqlInsertEnterprise, [userId, 0], (insertErr) => {
          if (insertErr) {
            console.error('Error al insertar enterprises: ' + insertErr.message);
            return res.status(500).json({ error: 'Error interno del servidor' });
          }
          // Una vez insertado, obtener los datos nuevamente
          db.query(sqlEnterprise, [userId], (fetchErr, newEnterpriseData) => {
            if (fetchErr) {
              console.error('Error al obtener enterprises: ' + fetchErr.message);
              return res.status(500).json({ error: 'Error interno del servidor' });
            }
            const enterprises = newEnterpriseData[0].enterprises + extraEnterprises;
            sendResponse(userId, userName, userLevel, enterprises, userData, res);
          });
        });
      } else {
        const enterprises = enterpriseData[0].enterprises + extraEnterprises;
        sendResponse(userId, userName, userLevel, enterprises, userData, res);
      }
    });
  });
});

function sendResponse(userId, userName, userLevel, enterprises, userData, res) {
  res.json({
    userId,
    userName,
    userLevel,
    enterprises,
    data: userData,
  });
}

// ************* Endpoint para eliminar una empresa de un usuario ************* //

app.delete('/api/delete/:userId/:enterpriseId', verifyToken, (req, res) => {
  const { userId, enterpriseId } = req.params;

  const deleteQuery = `
    DELETE FROM cdx_txt 
    WHERE user_id = ? AND ID = ?
  `;

  db.query(deleteQuery, [userId, enterpriseId], (err, result) => {
    if (err) {
      console.error('Error al eliminar la fila:', err);
      return res.status(500).json({ error: 'Error interno al eliminar la fila' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Fila no encontrada o ya eliminada' });
    }

    res.status(200).json({ message: 'Fila eliminada correctamente' });
  });
});


// ************* Endpoint para actualizar el número de empresas de un usuario ************* //

app.put('/api/update-enterprises', verifyToken, (req, res) => {
  const { userId, enterprises } = req.body;

  if (!userId || enterprises === undefined) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos' });
  }

  const checkQuery = `
    SELECT * 
    FROM cdx_txt_enterprises 
    WHERE user_id = ?
  `;

  const insertQuery = `
    INSERT INTO cdx_txt_enterprises (user_id, enterprises) 
    VALUES (?, ?)
  `;

  const updateQuery = `
    UPDATE cdx_txt_enterprises 
    SET enterprises = ? 
    WHERE user_id = ?
  `;

  db.query(checkQuery, [userId], (err, result) => {
    if (err) {
      console.error('Error al verificar la existencia del usuario en cdx_txt_enterprises:', err);
      return res.status(500).json({ error: 'Error interno al verificar el usuario' });
    }

    if (result.length === 0) {
      db.query(insertQuery, [userId, enterprises], (insertErr, insertResult) => {
        if (insertErr) {
          console.error('Error al insertar nuevo registro en cdx_txt_enterprises:', insertErr);
          return res.status(500).json({ error: 'Error interno al insertar registro' });
        }

        return res.status(201).json({ success: true, message: 'Registro creado y número de empresas actualizado correctamente' });
      });
    } else {
      db.query(updateQuery, [enterprises, userId], (updateErr, updateResult) => {
        if (updateErr) {
          console.error('Error al actualizar empresas:', updateErr);
          return res.status(500).json({ error: 'Error interno al actualizar empresas' });
        }

        return res.status(200).json({ success: true, message: 'Número de empresas actualizado correctamente' });
      });
    }
  });
});


// ************* Endpoint para la actualización (UPDATE) ************* //

app.put('/api/update', (req, res) => {
  const { data, dataName, userId, dataId } = req.body;

  // Validar que los parámetros requeridos estén presentes
  if (!data || !dataName || !userId || !dataId) {
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
  const sql = `UPDATE cdx_txt SET ${dataName} = ? WHERE user_id = ? AND ID = ?`;
  db.query(sql, [newDataSerializada, userId, dataId], (err, result) => {
    if (err) {
      return res.status(500).send('Error interno del servidor');
    }
    // Verificar si se actualizó alguna fila
    if (result.affectedRows === 0) {
      return res.status(404).send('Datos no encontrados');
    }
    res.send('Datos actualizados correctamente');
  });
});

// ************* Endpoint para la actualización de una empresa (UPDATE) ************* //

app.put('/api/update-company', verifyToken, (req, res) => {
  const { dataId, yearCurrent, yearPrevious, personalData } = req.body;
  const userId = req.userId;

  if (!yearCurrent || !yearPrevious || !personalData) {
    return res.status(400).send('Parámetros faltantes');
  }
  const updateSql = 'UPDATE cdx_txt SET yearCurrent = ?, yearPrevious = ?, personalData = ? WHERE user_id = ?  AND ID = ?';
  const personalDataSerialized = JSON.stringify(personalData);
  db.query(updateSql, [yearCurrent, yearPrevious, personalDataSerialized, userId, dataId], (err, result) => {
    if (err) {
      console.error('Error al actualizar datos: ' + err.message);
      return res.status(500).send('Error interno del servidor');
    }
    res.status(200).send('Datos actualizados correctamente');
  });
});

// ************* Endpoint para seleccionar todas las empresas que requieran cambio de activos ************* //

// Nota: verificar el userLevel para permitir esta operación

app.get('/api/get-requests', verifyToken, (req, res) => {

  const sql = 'SELECT ID, personalData, requestChange FROM cdx_txt WHERE requestChange IS NOT NULL AND requestApproved IS NOT TRUE';

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error al obtener datos: ' + err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    res.json({ data: results });
  });
});

// ************* Endpoint para que el usuario solicite un cambio ************* //

app.post('/api/send-request', verifyToken, (req, res) => {
  const { dataId, requestChange } = req.body;
  const userId = req.userId;

  if (!requestChange || !dataId) {
    return res.status(400).send('Parámetros faltantes');
  }

  const updateSql = 'UPDATE cdx_txt SET requestChange = ?, requestApproved = ? WHERE user_id = ?  AND ID = ?';

  db.query(updateSql, [requestChange, null, userId, dataId], (err, result) => {
    if (err) {
      console.error('Error al actualizar datos: ' + err.message);
      return res.status(500).send('Error interno del servidor');
    }
    res.status(200).send('Solicitud ingresada correctamente');
  });
});

// ************* Endpoint para que un administrador acepte o rechace un cambio a un usuario ************* //

app.put('/api/check-request', verifyToken, (req, res) => {

  // Nota: verificar el token para revisar el userLevel antes de realizar la operación

  const { dataId, approvalStatus, personalData } = req.body;

  if (!dataId || !personalData) {
    return res.status(400).send('Parámetros faltantes');
  }

  const updateSql = 'UPDATE cdx_txt SET personalData = ?, requestChange = ?, requestApproved = ? WHERE ID = ?';

  const personalDataSerialized = JSON.stringify(personalData)

  db.query(updateSql, [personalDataSerialized, null, approvalStatus, dataId], (err, result) => {
    if (err) {
      console.error('Error al actualizar datos: ' + err.message);
      return res.status(500).send('Error interno del servidor');
    }
    res.status(200).send('Solicitud ingresada correctamente');
  });
});

// ************* Endpoint para confirmar pago y aumentar empresas a un usuario ************* //

app.post('/confirm-payment', (req, res) => {
  const { userId, date, amount, clientTransactionId, transactionId, transactionStatus } = req.body;

  // Verificar si el clientTransactionId ya existe
  db.query(
    'SELECT id FROM cdx_txt_payments WHERE clientTransactionId = ?',
    [clientTransactionId],
    (err, result) => {
      if (err) {
        console.error('Error al verificar clientTransactionId:', err);
        return res.status(500).json({ error: 'Error al verificar clientTransactionId' });
      }

      if (result.length > 0) {
        return res.status(400).json({ error: 'clientTransactionId ya existe' });
      }

      // Insertar el pago en cdx_txt_payments
      db.query(
        `INSERT INTO cdx_txt_payments 
         (user_id, date, amount, clientTransactionId, transactionId, transactionStatus) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, date, amount, clientTransactionId, transactionId, transactionStatus],
        (err) => {
          if (err) {
            console.error('Error al insertar el pago:', err);
            return res.status(500).json({ error: 'Error al insertar el pago' });
          }

          // Actualizar el valor de enterprises en cdx_txt_enterprises
          db.query(
            `UPDATE cdx_txt_enterprises 
             SET enterprises = enterprises + 1 
             WHERE user_id = ?`,
            [userId],
            (err) => {
              if (err) {
                console.error('Error al actualizar enterprises:', err);
                return res.status(500).json({ error: 'Error al actualizar enterprises' });
              }

              res.status(201).json({
                message: 'Pago registrado y enterprises actualizado correctamente',
              });
            }
          );
        }
      );
    }
  );
});


// ************* Puerto ************* //

app.listen(8760, () => {
  console.log(`Servidor Express corriendo en el puerto ${PORT}`);
});
