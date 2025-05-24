import jwt from 'jsonwebtoken';
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
//import cf from "aws-cloudfront-sign";
import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

const client = new SecretsManagerClient({ region: 'us-east-1' });

const SECRET_NAME = 'dev/fit4live/Mysql';
const JWT_SECRET_NAME = 'dev/fit4live/JWTSecret';
const CERTIFICATES_SECRET_NAME = 'dev/fit4live/Certificates';

async function getSecret(secretName) {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);
    if ('SecretString' in response) return JSON.parse(response.SecretString);
    else return JSON.parse(Buffer.from(response.SecretBinary, 'base64').toString('ascii'));
  }

function formatPrivateKey(key) {
    const header = "-----BEGIN PRIVATE KEY-----";
    const footer = "-----END PRIVATE KEY-----";
    let content = key.replace(header, "").replace(footer, "").trim();
    content = content.replace(/\s+/g, '');
    const formatted = content.match(/.{1,64}/g).join('\n');
    return `${header}\n${formatted}\n${footer}`;
  }

export const handler = async (event) => {
    const body = JSON.parse(event.body)
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
        
        const certificates = await getSecret(CERTIFICATES_SECRET_NAME);
        const privateKey = formatPrivateKey(certificates.SignUrlPrivateKey);
        //certificates.SignUrlPrivateKey.replace(/\\n/g, '\n')

        const keyPairId = "KCIZH4IQVWTIA"
        
        const expiresInSeconds = Math.floor(Date.now() / 1000) + 180;
        const policy = {
            Statement: [
              {
                Resource: body.url,
                Condition: {
                  DateLessThan: {
                    "AWS:EpochTime": expiresInSeconds
                  },
                },
              },
            ],
          };
          
        const policyString = JSON.stringify(policy);
        console.log("keyPairId: ", keyPairId);
        console.log("privateKey: ", privateKey);
        console.log("policyString: ", policyString);

        
        const signedUrl = getSignedUrl({
            keyPairId,
            privateKey: privateKey,
            policy: policyString
          });

        return {
            statusCode: 200,
            body: JSON.stringify({
                statusCode: 200,
                body: signedUrl
            })
        };

    } catch (err) {
        const { JsonWebTokenError } = jwt;
        console.error('Error al generar firma:', err);
        if (err instanceof JsonWebTokenError) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Token inválido' })
            };
        } else {
            return {
                statusCode: 500,
                body: { error: 'Error al generar firma' }
            };
        }
    } finally {
        if (connection) await connection.end();
    }
};
