import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
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

        const customerId = uuidv4();
        const { name, lastname, bornDate, dni, phone, email, password } = body;

        const existingUser = await connection.execute(`
            SELECT * FROM Customer WHERE email = ? AND enable = 1;
        `, [email]);

        console.log('existingUser:', existingUser);
        if (existingUser[0].length > 0) {
            return {
                statusCode: 400,
                error: 'El usuario ya existe'
            };
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const query = `
        INSERT INTO Customer(idCustomer, name, lastname, bornDate, dni, phone, email, password, enable)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1)
        `
        await connection.execute(query, [customerId, name, lastname, bornDate, dni, phone, email, passwordHash]);

        return {
            statusCode: 200,
            body: customerId
        };

    } catch (err) {
        console.error('Error registrar usuario:', err);
        return {
            statusCode: 500,
            error: 'Error al registrar usuario'
        };
    } finally {
        if (connection) await connection.end();
    }
};
