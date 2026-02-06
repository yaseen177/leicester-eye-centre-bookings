export default {
    async fetch(request, env) {
      const corsHeaders = {
        "Access-Control-Allow-Origin": "https://leicester-eye-centre-bookings.pages.dev",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };
  
      if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  
      try {
        const { to, body, reminderTime, oldReminderSid } = await request.json();
        const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  
        // 1. Cancel old reminder if it exists
        if (oldReminderSid) {
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages/${oldReminderSid}.json`, {
            method: "POST",
            headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ Status: "canceled" })
          });
        }
  
        // 2. Logic to bypass 15-minute delay
        const now = new Date();
        const schedTime = new Date(reminderTime);
        const diffInMinutes = (schedTime - now) / (1000 * 60);
  
        const params = new URLSearchParams({
          To: to,
          Body: body,
          MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
          From: "EYE CENTRE" 
        });
  
        // Only schedule if it's between 15 mins and 35 days in the future
        if (diffInMinutes >= 15 && diffInMinutes <= 50400) {
          params.append("ScheduleType", "fixed");
          params.append("SendAt", schedTime.toISOString());
        } 
        // Otherwise, the worker sends it immediately by NOT adding ScheduleType
  
        const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: "POST",
          headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: params
        });
  
        const twilioData = await twilioRes.json();
        return new Response(JSON.stringify({ 
          success: true, 
          reminderSid: twilioData.sid,
          status: twilioData.status 
        }), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
  
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { 
          status: 500, headers: corsHeaders 
        });
      }
    }
  };