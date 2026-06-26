import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "Royal Canin CareCircle" });
  });

  // Mock endpoint for Vet Matching (Logic can be expanded)
  app.get("/api/vets/match", (req, res) => {
    const { location } = req.query;
    const city = String(location || "Mumbai").split(",")[0].trim();
    const isMumbai = city.toLowerCase() === "mumbai";
    
    // Coordinates lookup dictionary
    const CITY_COORDS: Record<string, { lat: number, lng: number }> = {
      mumbai: { lat: 19.0760, lng: 72.8777 },
      delhi: { lat: 28.6139, lng: 77.2090 },
      bangalore: { lat: 12.9716, lng: 77.5946 },
      bengaluru: { lat: 12.9716, lng: 77.5946 },
      pune: { lat: 18.5204, lng: 73.8567 },
      hyderabad: { lat: 17.3850, lng: 78.4867 },
      chennai: { lat: 13.0827, lng: 80.2707 },
      kolkata: { lat: 22.5726, lng: 88.3639 },
      london: { lat: 51.5074, lng: -0.1278 },
      "new york": { lat: 40.7128, lng: -74.0060 }
    };

    const norm = city.toLowerCase();
    let base = CITY_COORDS[norm];
    if (!base) {
      // Deterministic hash based on city string to support custom cities reliably
      let hash = 0;
      for (let i = 0; i < norm.length; i++) {
        hash = norm.charCodeAt(i) + ((hash << 5) - hash);
      }
      const latOffset = (Math.abs(hash) % 100) / 2000 - 0.025; // slightly offset
      const lngOffset = (Math.abs(hash >> 8) % 100) / 2000 - 0.025;
      base = { lat: 19.0760 + latOffset, lng: 72.8777 + lngOffset };
    }
    
    // Simulated vet data that adapts slightly to the city
    const vets = [
      { 
        id: "v1", 
        name: "Dr. Aisha Rao", 
        location: isMumbai ? "Bandra, Mumbai" : `Central ${city}`, 
        rating: 4.8, 
        ratingCount: 124, 
        availability: "9 AM - 7 PM", 
        distance: "0.8 km",
        lat: isMumbai ? 19.0596 : base.lat - 0.005,
        lng: isMumbai ? 72.8295 : base.lng - 0.006
      },
      { 
        id: "v2", 
        name: "Dr. Karan Mehra", 
        location: isMumbai ? "Andheri West, Mumbai" : `Main Market, ${city}`, 
        rating: 4.5, 
        ratingCount: 89, 
        availability: "24/7", 
        distance: "2.1 km",
        lat: isMumbai ? 19.1136 : base.lat + 0.012,
        lng: isMumbai ? 72.8697 : base.lng + 0.008
      },
      { 
        id: "v3", 
        name: "Dr. Sneha Patil", 
        location: isMumbai ? "Juhu, Mumbai" : `High Street, ${city}`, 
        rating: 4.9, 
        ratingCount: 212, 
        availability: "10 AM - 6 PM", 
        distance: "1.5 km",
        lat: isMumbai ? 19.0988 : base.lat + 0.002,
        lng: isMumbai ? 72.8264 : base.lng - 0.002
      },
    ];
    res.json(vets);
  });

  // Trigger Alerts Logic (Internal API for prototype simulation)
  app.post("/api/simulate-trigger", (req, res) => {
    const { type, breed, age } = req.body;
    let message = "";
    
    if (type === "weather") {
      const weatherAlerts = [
        `High humidity alert for your ${breed} today – ensure they have a cool place to rest.`,
        `Heat alert: Typical for this time in Mumbai. Keep your ${breed} hydrated and avoid long afternoon walks.`,
        `Monsoon warning: Wet paws can lead to infections. Dry your puppy's paws thoroughly after outdoor trips.`
      ];
      message = weatherAlerts[Math.floor(Math.random() * weatherAlerts.length)];
    } else if (type === "lifecycle") {
      if (age <= 8) {
        message = "Socialization Window: This is a critical time for your puppy to meet new people and gentle dogs.";
      } else if (age <= 12) {
        message = "Teething phase alert: Your puppy might be chewing more this week. Try chilled rubber toys!";
      } else {
        message = "Growth Spurt: You might notice your puppy sleeping more as they direct energy into growing bones.";
      }
    } else if (type === "nutrition") {
      message = `Proactive Tip: As a ${breed}, your puppy has specific heart health needs. Royal Canin Puppy formula is precisely balanced for this.`;
    } else {
      message = "General Care Tip: Routine checkups are key to a healthy start.";
    }

    res.json({ type, message, priority: "High" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
