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
  
        // 2. Logic to bypass 15-minute scheduling delay for testing
        const now = new Date();
        const schedTime = new Date(reminderTime);
        const diffInMinutes = (schedTime - now) / (1000 * 60);
  
        const params = new URLSearchParams({
          To: to,
          Body: body,
          // Using your Twilio Phone Number instead of Alphanumeric ID
          From: env.TWILIO_PHONE_NUMBER 
        });
  
        // Twilio Scheduling requires a Messaging Service. 
        // If you are using a Service, uncomment the line below:
        // params.append("MessagingServiceSid", env.TWILIO_MESSAGING_SERVICE_SID);
  
        // Only attempt to schedule if the time is > 15 minutes away
        if (diffInMinutes >= 15 && diffInMinutes <= 50400) {
          params.append("ScheduleType", "fixed");
          params.append("SendAt", schedTime.toISOString());
        } 
  
        const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: "POST",
          headers: { 
            "Authorization": `Basic ${auth}`, 
            "Content-Type": "application/x-www-form-urlencoded" 
          },
          body: params
        });
  
        const twilioData = await twilioRes.json();
        
        return new Response(JSON.stringify({ 
          success: twilioRes.ok, 
          reminderSid: twilioData.sid,
          error: twilioData.message 
        }), { 
          status: twilioRes.status, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
  
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { 
          status: 500, headers: corsHeaders 
        });
      }
    }
  };