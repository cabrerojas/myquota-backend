import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

export async function authenticate() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id } = credentials.installed;
    const redirect_uri = 'urn:ietf:wg:oauth:2.0:oob'; // Redireccionamiento que evita localhost
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);

    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        oAuth2Client.setCredentials(token);
    } else {
        const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
        console.warn('Authorize this app by visiting this URL:', authUrl);

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.question('Enter the code from that page here: ', async (code) => {
            const token = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(token.tokens);

            fs.writeFileSync(TOKEN_PATH, JSON.stringify(token.tokens));
            console.warn('Token stored to', TOKEN_PATH);
            rl.close();
        });
    }
    return oAuth2Client;
}