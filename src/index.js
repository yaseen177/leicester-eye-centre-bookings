export default {
    async fetch(request, env) {
      // 1. Universal CORS Headers
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*", // Allow both your live site and localhost
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };
  
      // 2. Handle Preflight Requests
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }
  
      try {
        const data = await request.json();
  
        // ============================================================
        // ROUTE 1: SCHEDULE GOOGLE REVIEW EMAIL (Using QStash)
        // ============================================================
        if (data.type === "schedule_review") {
          
          // You must add these two variables in Cloudflare Settings -> Variables
          const QSTASH_TOKEN = env.QSTASH_TOKEN; 
          const EMAILJS_PRIVATE_KEY = env.EMAILJS_PRIVATE_KEY; 
  
          if (!QSTASH_TOKEN || !EMAILJS_PRIVATE_KEY) {
            throw new Error("Missing QSTASH_TOKEN or EMAILJS_PRIVATE_KEY env variables");
          }
          
          // Call QStash to hold the email for 10 minutes (600s)
          const qstashResponse = await fetch("https://qstash.upstash.io/v1/publish/https://api.emailjs.com/api/v1.0/email/send", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${QSTASH_TOKEN}`,
              "Content-Type": "application/json",
              "Upstash-Delay": "600s", // 10 Minutes Delay
              "Upstash-Forward-Content-Type": "application/json"
            },
            body: JSON.stringify({
              service_id: "service_et75v9m", // Your EmailJS Service ID
              template_id: "template_review", // Your Review Template ID
              user_id: "kjN74GNmFhu6fNch8",  // Your Public Key
              accessToken: EMAILJS_PRIVATE_KEY, // Private Key
              template_params: {
                to_email: data.email,
                patient_name: data.patientName,
                review_link: data.reviewLink
              }
            })
          });
  
          const result = await qstashResponse.json();
          
          return new Response(JSON.stringify({ success: true, id: result.messageId }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
  
        // ============================================================
        // ROUTE 2: SEND SMS (Your Existing Logic)
        // ============================================================
        
        // Map variables from both your code snippets to handle any format
        const to = data.to;
        const body = data.body;
        const scheduleTime = data.reminderTime || data.sendAt; // Handles both naming conventions
        const cancelSid = data.oldReminderSid || data.cancelSid;
  
        const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  
        // A. Cancel existing reminder if ID provided
        if (cancelSid) {
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages/${cancelSid}.json`, {
            method: "POST",
            headers: { 
              "Authorization": `Basic ${auth}`, 
              "Content-Type": "application/x-www-form-urlencoded" 
            },
            body: new URLSearchParams({ Status: "canceled" })
          });
        }
  
        // B. Prepare parameters
        const params = new URLSearchParams({
          To: to,
          Body: body,
          // Prefer Messaging Service if available (better for UK), otherwise fallback or use From
          MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID || "", 
        });
  
        // If no Messaging Service, use standard "From"
        if (!env.TWILIO_MESSAGING_SERVICE_SID) {
          params.append("From", env.TWILIO_PHONE_NUMBER || "EYE CENTRE");
        }
  
        // C. Scheduling Logic
        if (scheduleTime) {
          const now = new Date();
          const sendAtDate = new Date(scheduleTime);
          const diffInMinutes = (sendAtDate.getTime() - now.getTime()) / (1000 * 60);
  
          // Twilio requires schedule to be at least 15 mins in future and less than 7 days
          if (diffInMinutes >= 15 && diffInMinutes <= 10080) {
            params.append("ScheduleType", "fixed");
            params.append("SendAt", sendAtDate.toISOString());
          }
        }
  
        // D. Send to Twilio
        const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: "POST",
          headers: { 
            "Authorization": `Basic ${auth}`, 
            "Content-Type": "application/x-www-form-urlencoded" 
          },
          body: params
        });
  
        const twilioData = await twilioRes.json();
  
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