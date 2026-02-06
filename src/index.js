export default {
    async fetch(request, env) {
      const { to, body, sendAt, cancelSid } = await request.json();
      const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  
      // If a cancelSid is provided, cancel the existing scheduled reminder first
      if (cancelSid) {
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages/${cancelSid}.json`, {
          method: "POST",
          headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ Status: "canceled" })
        });
      }
  
      // Send immediate confirmation OR schedule the 24h reminder
      const params = new URLSearchParams({
        To: to,
        Body: body,
        MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
        From: "EYE CENTRE" // Your requested Alphanumeric Sender ID
      });
  
      if (sendAt) {
        params.append("ScheduleType", "fixed");
        params.append("SendAt", sendAt); // ISO-8601 format
      }
  
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: "POST",
        headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: params
      });
  
      return new Response(await res.text(), { status: res.status });
    }
  };