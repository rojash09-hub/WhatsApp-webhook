const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = "mi_token_123";

app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).send("Webhook activo");
});

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (!mode) {
    return res.status(200).send("Webhook funcionando");
  }

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post('/webhook', (req, res) => {
  console.log("Payload recibido:");
  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
