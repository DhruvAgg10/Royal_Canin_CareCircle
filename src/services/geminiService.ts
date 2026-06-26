import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function triagePuppyQuery(query: string, puppyData: any) {
  const systemInstruction = `
    You are the Royal Canin CareCircle AI assistant for puppy owners.
    Puppy Profile: ${JSON.stringify(puppyData)}

    Your goal is to triage the owner's query.
    1. If the query is specifically about finding a vet, nearby clinics, or veterinary services, set "suggestVet" to true and "advice" to a confirmation that you are scanning for top-rated clinics.
    2. If the issue sounds like a medical emergency (e.g., non-stop vomiting, seizures, difficulty breathing, major injury), recommend immediate vet contact and set "suggestVet" to true.
    3. If it's a common puppy issue (e.g., minor teething, house training, basic feeding), provide vet-backed simple advice.
    4. Keep responses extremely short, actionable, and warm.
    5. Maximum 2-3 bullet points.

    Response format:
    JSON {
      "advice": "string",
      "isSerious": boolean,
      "suggestVet": boolean
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: query }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("AI Triage Error:", error);
    return {
      advice: "I'm having trouble analyzing that right now. If you're worried, please contact a vet.",
      isSerious: false,
      suggestVet: true
    };
  }
}
