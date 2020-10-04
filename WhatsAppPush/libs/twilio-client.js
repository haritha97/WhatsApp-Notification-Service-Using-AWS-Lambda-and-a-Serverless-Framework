const client = require("twilio")(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

exports.sendWhatsAppMessageViaTwilio = async ({ from, body, to }) => {
  return new Promise((resolve, reject) => {
    client.messages
      .create({
        from: `whatsapp:${from}`,
        body: body,
        to: `whatsapp:${to}`,
      })
      .then((response) => resolve(response))
      .catch((error) => reject(error));
  });
};
