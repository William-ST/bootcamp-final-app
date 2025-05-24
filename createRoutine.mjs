import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: 'us-east-1' });
const SECRET_NAME = 'dev/fit4live/Mysql';

async function getSecret(secretName) {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);
    if ('SecretString' in response) return JSON.parse(response.SecretString);
    else return JSON.parse(Buffer.from(response.SecretBinary, 'base64').toString('ascii'));
  }

export const handler = async (body) => {
  const errorMessage = {
    statusCode: 401,
    body: { message: 'Ha ocurrido un error' },
  };
    let connection;

    try {
      const secret = await getSecret(SECRET_NAME);

      connection = await mysql.createConnection({
          host: secret.host,
          user: secret.username,
          password: secret.password,
          database: secret.dbInstanceIdentifier,
          port: secret.port || 3306
      });
      await connection.beginTransaction();

      const { customerId, startDate, endDate, target } = body;

      console.log("body: ", body)

      const [existingUser] = await connection.execute(`
            SELECT idCustomer FROM Customer WHERE idCustomer = ? AND enable = 1 LIMIT 1;
      `, [customerId]);
      console.log("existingUser: ", existingUser)

      if (!existingUser || !existingUser[0]) {
        return errorMessage;
      }

      const routineId = uuidv4();
      await connection.execute(`
        INSERT INTO Routine(idRoutine, startDate, endDate, target, Customer_idCustomer, enable)
        VALUES(?, ?, ?, ?, ?, 1)
      `, [routineId, startDate, endDate, target, customerId]);
      
      console.log("routineId: ", routineId)

      const [exercises] = await connection.execute(`
        SELECT * FROM Exercise WHERE enable = 1;
      `);
      
      console.log("exercises: ", exercises)
      if (!exercises || exercises.length == 0) {
        await connection.rollback();
        errorMessage.body.message = "No hay ejercicios"
        return errorMessage;
      }

      for (const exercise of exercises) {
        const detailId = uuidv4();
        console.log("detailId: ", detailId);
        console.log("routineId: ", routineId);
        console.log("exercise.idExercise: ", exercise.idExercise);
        await connection.execute(`
          INSERT INTO RoutineDetail(idRoutineDetail, Routine_idRoutine, Exercise_idExercise, enable)
          VALUES(?, ?, ?, 1)
        `, [detailId, routineId, exercise.idExercise]);
      }

      await connection.commit();
      
      return {
        statusCode: 200,
        body: routineId
      };
    } catch (err) {
      await connection.rollback();
        console.error('Error crear rutina:', err);
        return {
            statusCode: 500,
            body: { error: 'Error crear rutina' }
        };
    } finally {
        if (connection) await connection.end();
    }
};
