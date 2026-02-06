export default {
    async fetch(request, env) {
      // 1. Define CORS Headers
      const corsHeaders = {
        "Access-Control-Allow-Origin": "https://leicester-eye-centre-bookings.pages.dev",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };
  
      // 2. Handle Preflight OPTIONS requests
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: corsHeaders,
        });
      }
  
      // --- Start of existing Twilio Logic ---
      try {
        const { to, body, sendAt, cancelSid } = await request.json();
        const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  
        // Optional: Cancel existing reminder
        if (cancelSid) {
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages/${cancelSid}.json`, {
            method: "POST",
            headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ Status: "canceled" })
          });
        }
  
        // Prepare Twilio SMS
        const params = new URLSearchParams({
          To: to,
          Body: body,
          MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
          From: "EYE CENTRE" 
        });
  
        if (sendAt) {
          params.append("ScheduleType", "fixed");
          params.append("SendAt", sendAt);
        }
  
        const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: "POST",
          headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: params
        });
  
        const twilioData = await twilioRes.json();
  
        // 3. Return response with CORS headers
        return new Response(JSON.stringify(twilioData), { 
          status: twilioRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
  
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { 
          status: 500, 
          headers: corsHeaders 
        });
      }
    }
  };