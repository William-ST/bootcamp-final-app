import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
const client = new SecretsManagerClient({ region: 'us-east-1' });

const SECRET_NAME = 'dev/fit4live/Mysql';
const JWT_SECRET_NAME = 'dev/fit4live/JWTSecret';

async function getSecret(secretName) {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);
    if ('SecretString' in response) return JSON.parse(response.SecretString);
    else return JSON.parse(Buffer.from(response.SecretBinary, 'base64').toString('ascii'));
  }

export const handler = async (event) => {
    let connection;
    try {
        const authHeader = event.headers?.Authorization || event.headers?.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return {
            statusCode: 401,
            body: JSON.stringify({ error: 'Token no proporcionado o mal formado' })
          };
        }
        
        const token = authHeader.split(' ')[1];
        const jwtSecret = await getSecret(JWT_SECRET_NAME);
        
        console.log("token: ", token);
        const decoded = jwt.verify(token, jwtSecret.JWT_SECRET);
        console.log("decoded: ", decoded);
        const secret = await getSecret(SECRET_NAME);

        connection = await mysql.createConnection({
            host: secret.host,
            user: secret.username,
            password: secret.password,
            database: secret.dbInstanceIdentifier,
            port: secret.port || 3306
        });

        const customerId = decoded.sub;
        console.log("customerId: ", customerId);
        const sql = `
        SELECT
            r.idRoutine, r.startDate, r.endDate, r.target, e.idExercise, e.name, e.description,
            e.imageUrl, e.videoUrl FROM Routine r
        INNER JOIN RoutineDetail rd ON r.idRoutine = rd.Routine_idRoutine
        INNER JOIN Exercise e ON e.idExercise = rd.Exercise_idExercise
        INNER JOIN Customer c ON c.idCustomer = r.Customer_idCustomer
        WHERE r.enable = 1 AND rd.enable = 1 AND e.enable = 1 AND c.enable = 1 AND c.idCustomer = ?
        `;
        // idRoutine, startDate, endDate, target, idExercise, name, description, imageUrl, videoUrl
        
        const [rows] = await connection.execute(sql, [customerId]);
        console.log("rows: ", rows);

        if (!rows || rows.length === 0) return {
            statusCode: 200,
            body: {
                message: "No se ha registrado una rutina."
            }
        };

        const { idRoutine, startDate, endDate, target } = rows[0];
        
        const exercises = rows.map(row => ({
            idExercise: row.idExercise,
            name: row.name,
            description: row.description,
            imageUrl: row.imageUrl,
            videoUrl: row.videoUrl
        }));
        const response = JSON.stringify({
            idRoutine,
            startDate,
            endDate,
            target,
            exercises
        })
        console.log("response: ", response);
        return {
            statusCode: 200,
            body: JSON.stringify({
                statusCode: 200,
                body: response
            })
        };

    } catch (err) {
        const { JsonWebTokenError } = jwt;
        console.error('Error al obtener mi rutina:', err);
        if (err instanceof JsonWebTokenError) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Token inválido' })
            };
        } else {
            return {
                statusCode: 500,
                body: { error: 'Error al obtener mi rutina' }
            };
        }
    } finally {
        if (connection) await connection.end();
    }
};
