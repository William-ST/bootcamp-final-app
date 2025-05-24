import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
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

export const handler = async (body) => {
    const errorMessage = {
      statusCode: 401,
      body: { message: 'Usuario y/o contraseña incorrectos' },
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

        const { email, password } = body;

        const [rows] = await connection.execute(
          'SELECT idCustomer, name, lastname, email, password FROM Customer WHERE email = ? LIMIT 1',
          [email]
        );
        
        if (rows.length === 0) {
          return errorMessage;
        }

        const user = rows[0];

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
          return errorMessage;
        }

        const jwtSecret = await getSecret(JWT_SECRET_NAME);
        console.log("jwtSecret: ",jwtSecret);
        console.log(jwtSecret.JWT_SECRET);
        const token = jwt.sign(
          { sub: user.idCustomer, email: user.email },
          jwtSecret.JWT_SECRET,
          { expiresIn: '3h' }
        );
    
        return {
          statusCode: 200,
          body: {
            token: token,
            name: user.name,
            lastname: user.lastname,
            email: user.email,
            customerId: user.idCustomer
          }
        };
    } catch (err) {
        console.error('Error autenticar usuario:', err);
        return {
            statusCode: 500,
            body: { error: 'Error al autenticar usuario' }
        };
    } finally {
        if (connection) await connection.end();
    }
};
