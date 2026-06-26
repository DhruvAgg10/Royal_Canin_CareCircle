/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Phone, Video, MoreVertical, ChevronLeft, Search, Bell, Info, Calendar, 
  Clock, Trash2, CheckCircle, X, Mic, MicOff, VideoOff, MapPin, 
  RotateCcw, LogOut, Globe, Plus, RefreshCw, Layers, Check, 
  ChevronDown, ChevronRight, User, ShieldCheck, ShoppingBag, Receipt, Sparkles, Truck, FileText
} from "lucide-react";
import { APIProvider, Map as GoogleMap, AdvancedMarker, Pin, InfoWindow } from "@vis.gl/react-google-maps";
import { ChatBubble } from "./components/Chat/ChatBubble.tsx";
import { ChatInput } from "./components/Chat/ChatInput.tsx";
import { VetCard } from "./components/Chat/VetCard.tsx";
import { RatingSystem } from "./components/Chat/RatingSystem.tsx";
import { triagePuppyQuery } from "./services/geminiService.ts";
import { generateDietPDF, generateHealthTrackerPDF } from "./lib/pdfUtils.ts";
import { cn } from "./lib/utils.ts";

// Firebase imports
import { db, auth } from "./lib/firebase";
import { collection, doc, setDoc, getDocs } from "firebase/firestore";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";

interface Message {
  id: string;
  text: string;
  timestamp: Date;
  role: "user" | "assistant" | "vet" | "system";
  senderName?: string;
  isVetList?: boolean;
  vets?: any[];
  isRating?: boolean;
  isDietPlan?: boolean;
  isHealthTracker?: boolean;
  isQuickCommerce?: boolean;
  recommendedProduct?: any;
  recommendedProducts?: any[];
}

interface RCProduct {
  id: string;
  name: string;
  desc: string;
  price: number;
  image: string;
  badge: string;
  size: string;
}

const PRODUCTS_DB: Record<string, RCProduct[]> = {
  dog: [
    {
      id: "rc-dog-1",
      name: "Royal Canin Mini Puppy Dry Food",
      desc: "Specially crafted dry kibble formulated for small breed puppies prone to rapid growth and high energy needs.",
      price: 499,
      image: "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&q=80&w=200",
      badge: "Best Seller • Growth",
      size: "800g Value Pack"
    },
    {
      id: "rc-dog-2",
      name: "Royal Canin Golden Retriever Puppy Food",
      desc: "Tailor-made kibble to support healthy skin, beautiful golden coats, digestive security and steady bone development.",
      price: 2450,
      image: "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&q=80&w=200",
      badge: "Vet Prescribed • Breed Specific",
      size: "3kg Breeder Pack"
    },
    {
      id: "rc-dog-extra",
      name: "Royal Canin Gastrointestinal Puppy Dry",
      desc: "High energy veterinary exclusive formula with prebiotic fibers to support healthy digestion in developing puppies.",
      price: 1850,
      image: "https://images.unsplash.com/photo-1608454367599-c1437d4e3e2f?auto=format&fit=crop&q=80&w=200",
      badge: "Therapeutic Care • Gut Health",
      size: "2kg Gastro Pack"
    }
  ],
  cat: [
    {
      id: "rc-cat-1",
      name: "Royal Canin Mother & Babycat Gravy",
      desc: "A soft, easy-to-chew texture with crucial vitamins to support healthy development in very young kittens (1-4 months) and queens.",
      price: 1560,
      image: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&q=80&w=200",
      badge: "Early Growth • Weaning Essentials",
      size: "12 x 85g Cans"
    },
    {
      id: "rc-cat-2",
      name: "Royal Canin Kitten Instinctive Loaf Pouches",
      desc: "Formulated to match the nutritional profile instinctively preferred by growing kittens during their active development phase.",
      price: 1080,
      image: "https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&q=80&w=200",
      badge: "100% Authentic • Palatable Bites",
      size: "12 x 85g Pouches"
    }
  ]
};

const getRecommendedProductForProfile = (pData: any) => {
  const isCat = pData.petType?.toLowerCase() === "cat";
  const breed = pData?.breed?.toLowerCase() || "";
  if (isCat) {
    if (breed.includes("baby") || Number(pData.ageInWeeks) <= 8) {
      return PRODUCTS_DB.cat[0];
    }
    return PRODUCTS_DB.cat[1];
  } else {
    // Dog
    if (breed.includes("golden") || breed.includes("retriever") || breed.includes("lab")) {
      return PRODUCTS_DB.dog[1]; // Golden retriever formula
    }
    if (breed.includes("gastro") || breed.includes("stomach") || breed.includes("vomit") || breed.includes("vet") || breed.includes("health")) {
      return PRODUCTS_DB.dog[2]; // gastrointestinal
    }
    return PRODUCTS_DB.dog[0]; // mini puppy
  }
};

interface OnboardingStep {
  id: string;
  question: string;
  options?: string[];
  field: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  { 
    id: "petType", 
    question: "Is your pet a Dog 🐶 or a Cat 🐱?", 
    options: ["Dog", "Cat"], 
    field: "petType" 
  },
  { id: "breed", question: "What breed is your pet? 🐾", field: "breed" },
  { id: "age", question: "How old is your pet (in weeks)? 🍼", field: "ageInWeeks" },
  { id: "location", question: "In which city do you live? (for vet proximity) 🏙️", field: "location" },
  { 
    id: "preference", 
    question: "Choose your care preference level:", 
    options: ["Minimal", "Guided", "Active"], 
    field: "preferenceLevel" 
  }
];

const GOOGLE_MAPS_API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  "";
const hasValidGoogleMapsKey = Boolean(GOOGLE_MAPS_API_KEY) && GOOGLE_MAPS_API_KEY !== "YOUR_API_KEY" && GOOGLE_MAPS_API_KEY.trim() !== "";

export default function App() {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem("rc_chat_messages");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
      } catch (e) {
        console.error("Error parsing saved messages", e);
      }
    }
    return [
      {
        id: "welcome-1",
        text: "Welcome to Royal Canin CareCircle 🐾\nI’ll help you take care of your puppy with vet-backed guidance.",
        timestamp: new Date(),
        role: "assistant",
        senderName: "CareCircle Assistant"
      }
    ];
  });

  const [onboardingIndex, setOnboardingIndex] = useState(() => {
    const saved = localStorage.getItem("rc_onboarding_index");
    return saved ? parseInt(saved, 10) : -1;
  });

  const [puppyData, setPuppyData] = useState<any>(() => {
    const saved = localStorage.getItem("rc_puppy_data");
    return saved ? JSON.parse(saved) : { onboardingComplete: false };
  });

  const [vets, setVets] = useState<any[]>([]);
  const [isLoadingVets, setIsLoadingVets] = useState(false);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [activeVet, setActiveVet] = useState<any>(null);
  
  // New Consultation scheduling & live calling states
  const [schedulingVet, setSchedulingVet] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>(() => {
    const saved = localStorage.getItem("rc_appointments");
    return saved ? JSON.parse(saved) : [];
  });
  const [activeCallAppointment, setActiveCallAppointment] = useState<any | null>(null);

  // Reminders & Push alert states
  const [activeNotification, setActiveNotification] = useState<any>(null);

  // Google Maps state variables
  const [mapFocusedVet, setMapFocusedVet] = useState<any>(null);
  const [isMobileMapOpen, setIsMobileMapOpen] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 19.0760, lng: 72.8777 });
  const [mapZoom, setMapZoom] = useState(13);
  const [isInfoWindowOpen, setIsInfoWindowOpen] = useState(true);

  const handleLocateVet = (vet: any) => {
    if (vet.lat && vet.lng) {
      const vLat = Number(vet.lat);
      const vLng = Number(vet.lng);
      setMapFocusedVet(vet);
      setMapCenter({ lat: vLat, lng: vLng });
      setMapZoom(14);
      setIsInfoWindowOpen(true);
      setIsMobileMapOpen(true);
      
      addMessage({
        text: `📍 **CLINIC LOCATION SPECIFIED**\n\nShowing the route to **${vet.name}**:\n🏥 *${vet.location}*\n\nMap has centered on the clinic in the interactive Google Maps view!`,
        role: "system"
      });
    } else {
      addMessage({
        text: `⚠️ **Could not find coordinates for ${vet.name}**. Please request a fresh clinic search.`,
        role: "system"
      });
    }
  };
  const [notificationPermission, setNotificationPermission] = useState<string>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "default";
  });

  const playNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const osc1 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc1.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.15);
      
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gainNode2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(880.00, ctx.currentTime); // A5
        osc2.connect(gainNode2);
        gainNode2.connect(ctx.destination);
        
        gainNode2.gain.setValueAtTime(0.1, ctx.currentTime);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.25);
      }, 180);
    } catch (e) {
      console.warn("Web audio playback blocked or unsupported:", e);
    }
  };

  const triggerNotification = (appt: any) => {
    // 1. Play alert audio chime
    playNotificationSound();

    // 2. Set active design notification component
    setActiveNotification({
      id: "notif_" + Math.random().toString(36).substr(2, 9),
      title: "📅 Consultation Coming Up!",
      body: `Your consultation with ${appt.doctorTitle} begins in 15 minutes. Ready to join?`,
      appt: appt
    });

    // 3. Trigger native HTML5 Desktop push notifications
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        try {
          const n = new Notification("📅 Royal Canin CareCircle", {
            body: `Your consultation with ${appt.doctorTitle} is starting in 15 minutes!`,
          });
          n.onclick = () => {
            handleStartCall(appt);
            window.focus();
          };
        } catch (err) {
          console.warn("Failed to trigger native reminder:", err);
        }
      } else if (Notification.permission === "default") {
        Notification.requestPermission().then(p => {
          setNotificationPermission(p);
          if (p === "granted") {
            try {
              new Notification("📅 Royal Canin CareCircle", {
                body: `Your consultation with ${appt.doctorTitle} is starting in 15 minutes!`,
              });
            } catch (err) {
              console.warn(err);
            }
          }
        });
      }
    }

    // 4. Mirror notification alert to simulated WhatsApp chat logs
    addMessage({
      text: `🔔 **CONSULTATION REMINDER**\n\nYour clinical consultation room with **${appt.doctorTitle}** opens in 15 minutes (*${appt.timeStr}*).\n\n📱 *Prepare your setup and join the encrypted session directly via the left sidebar panel or click the active notification popup block.*`,
      role: "system"
    });
  };

  const parseAppointmentDateTime = (dateStr: string, timeStr: string): Date | null => {
    try {
      const cleanTime = timeStr.split(" (")[0]; // remove "(In 15m)" tags if present
      const parts = dateStr.split(", ");
      if (parts.length < 2) return null;
      const dayMonth = parts[1];
      const [dayNum, monthName] = dayMonth.split(" ");
      
      const [time, period] = cleanTime.split(" ");
      let [hours, minutes] = time.split(":").map(Number);
      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
      
      const curYear = new Date().getFullYear();
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const monthIdx = months.findIndex(m => m.toLowerCase().startsWith(monthName.toLowerCase()));
      if (monthIdx === -1) return null;
      
      return new Date(curYear, monthIdx, Number(dayNum), hours, minutes, 0, 0);
    } catch (e) {
      console.error("Failed parsing appointment datetime string:", e);
      return null;
    }
  };

  // Poll appointments every 10 seconds for real-time consultation triggers
  useEffect(() => {
    const checkConsultReminders = () => {
      const now = Date.now();
      const fifteenMinutesInMs = 15 * 60 * 1000;
      
      setAppointments(currAppts => {
        let changed = false;
        const mapped = currAppts.map(appt => {
          if (appt.status !== "scheduled" || appt.reminderSent) return appt;
          
          const dtComp = parseAppointmentDateTime(appt.dateStr, appt.timeStr);
          if (!dtComp) return appt;
          
          const diff = dtComp.getTime() - now;
          
          // Trigger the 15-minute window check! If diff is positive and <= 15 minutes
          if (diff > 0 && diff <= fifteenMinutesInMs) {
            triggerNotification(appt);
            changed = true;
            return { ...appt, reminderSent: true };
          }
          return appt;
        });
        
        if (changed) {
          localStorage.setItem("rc_appointments", JSON.stringify(mapped));
          return mapped;
        }
        return currAppts;
      });
    };

    checkConsultReminders();
    const pollId = setInterval(checkConsultReminders, 10000);
    return () => clearInterval(pollId);
  }, []);

  const handleTriggerMock15mReminder = () => {
    // Find first scheduled appointment
    let appt = appointments.find(a => a.status === "scheduled");
    
    if (!appt) {
      const demoTime = new Date(Date.now() + 15 * 60 * 1000);
      let demoHours = demoTime.getHours();
      const demoMinutes = demoTime.getMinutes().toString().padStart(2, "0");
      const ampm = demoHours >= 12 ? "PM" : "AM";
      demoHours = demoHours % 12;
      demoHours = demoHours ? demoHours : 12;
      const formattedDemoHours = demoHours.toString().padStart(2, "0");
      const timeStr = `${formattedDemoHours}:${demoMinutes} ${ampm} (In 15m)`;
      
      const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const dateStr = `${weekdays[demoTime.getDay()]}, ${demoTime.getDate()} ${months[demoTime.getMonth()]}`;

      appt = {
        id: "appt_demo_quick",
        vetId: "vet-demo",
        vetName: "Dr. Jessica Thompson",
        doctorTitle: "Dr. Jessica Thompson",
        dateStr: dateStr,
        timeStr: timeStr,
        type: "video",
        status: "scheduled",
        notes: "Real-time 15m countdown test simulation"
      };
      
      setAppointments(prev => [appt, ...prev]);
      
      addMessage({
        text: `📅 **DEMO CONSULTATION AUTO-CREATED**\n\n**Doctor:** ${appt.doctorTitle}\n**Date:** ${appt.dateStr}\n**Time:** ${appt.timeStr}\n\n*A simulated appointment has been initialized to trigger the 15-minute warning alert.*`,
        role: "system"
      });
    }

    triggerNotification(appt);
  };

  // Picker states
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>("11:00 AM");
  const [selectedCallType, setSelectedCallType] = useState<"video" | "voice">("video");
  const [consultNotes, setConsultNotes] = useState<string>("");

  useEffect(() => {
    localStorage.setItem("rc_appointments", JSON.stringify(appointments));
  }, [appointments]);

  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callSubtitles, setCallSubtitles] = useState("");

  const handleEndCall = () => {
    if (!activeCallAppointment) return;
    
    // Mark appointment as completed
    const currentAppt = activeCallAppointment;
    setAppointments(prev => prev.map(a => a.id === currentAppt.id ? { ...a, status: "completed" } : a));
    
    addMessage({
      text: `📞 **Call completed with ${currentAppt.doctorTitle}**\nDuration: ${Math.floor(callDuration / 60)}:${(callDuration % 60).toString().padStart(2, "0")}`,
      role: "system"
    });

    // Reset active call
    setActiveCallAppointment(null);

    // Ask user to provide feedback/rate
    setTimeout(() => {
      addMessage({
        text: `Thank you for consulting with ${currentAppt.doctorTitle}. Please rate your experience so we can maintain elite clinical standards.`,
        role: "assistant",
        isRating: true
      });
    }, 1000);
  };

  useEffect(() => {
    let interval: any = null;
    if (activeCallAppointment) {
      setCallDuration(0);
      setCallSubtitles("");
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [activeCallAppointment]);

  useEffect(() => {
    if (activeCallAppointment) {
      // Dynamic subtitles schedule to simulate real consultation
      if (callDuration === 2) {
        setCallSubtitles(`"Hello! I am ${activeCallAppointment.doctorTitle || activeCallAppointment.vetName}. Thank you for connecting."`);
      } else if (callDuration === 6) {
        setCallSubtitles(`"I can see you live in ${puppyData.location || "India"}. I love checking in on ${puppyData.breed || "puppies"}!"`);
      } else if (callDuration === 12) {
        setCallSubtitles(`"Based on the nutrition guidelines, your puppy is doing perfectly well."`);
      } else if (callDuration === 18) {
        setCallSubtitles(`"Please continue logging their diet in RC CareCircle and I will review it."`);
      } else if (callDuration === 24) {
        setCallSubtitles(`"Everything looks solid! I'll close our session now and send a verified summary."`);
      } else if (callDuration > 28) {
        // Auto end call for demo
        handleEndCall();
      }
    }
  }, [callDuration, activeCallAppointment]);

  const getUpcomingDays = () => {
    const days = [];
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    for (let i = 0; i < 4; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push({
        dayName: i === 0 ? "Today" : weekdays[d.getDay()],
        dateStr: `${d.getDate()} ${months[d.getMonth()]}`,
        fullDate: d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
      });
    }
    return days;
  };

  const TIME_SLOTS = [
    "09:30 AM",
    "11:00 AM",
    "12:30 PM",
    "02:00 PM",
    "03:30 PM",
    "05:00 PM",
    "06:30 PM",
    "⏰ DEMO TEST (IN 15 MINS)"
  ];

  const handleOpenScheduler = (vet: any) => {
    setSchedulingVet(vet);
    setSelectedDayIndex(0);
    setSelectedTimeSlot("11:00 AM");
    setSelectedCallType("video");
    setConsultNotes("");
  };

  const handleBookAppointment = () => {
    if (!schedulingVet) return;

    const days = getUpcomingDays();
    const dayObj = days[selectedDayIndex];

    const isDemoSlot = selectedTimeSlot === "⏰ DEMO TEST (IN 15 MINS)";
    let finalTimeStr = selectedTimeSlot;
    let finalDateStr = dayObj.fullDate;

    if (isDemoSlot) {
      const demoTime = new Date(Date.now() + 15 * 60 * 1000);
      let demoHours = demoTime.getHours();
      const demoMinutes = demoTime.getMinutes().toString().padStart(2, "0");
      const ampm = demoHours >= 12 ? "PM" : "AM";
      demoHours = demoHours % 12;
      demoHours = demoHours ? demoHours : 12;
      const formattedDemoHours = demoHours.toString().padStart(2, "0");
      
      finalTimeStr = `${formattedDemoHours}:${demoMinutes} ${ampm}`;
      
      const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      finalDateStr = `${weekdays[demoTime.getDay()]}, ${demoTime.getDate()} ${months[demoTime.getMonth()]}`;
    }

    const newAppt = {
      id: "appt_" + Math.random().toString(36).substr(2, 9),
      vetId: schedulingVet.id || schedulingVet.vetId || "vet-id",
      vetName: schedulingVet.name,
      doctorTitle: schedulingVet.name.includes("Dr. ") ? schedulingVet.name : `Dr. ${schedulingVet.name}`,
      dateStr: finalDateStr,
      timeStr: finalTimeStr,
      type: selectedCallType,
      status: "scheduled",
      notes: consultNotes
    };

    setAppointments(prev => [newAppt, ...prev]);

    // Send chat system message summarizing the scheduled consultation
    addMessage({
      text: `📅 **CONSULTATION SCHEDULED**\n\n**Doctor:** ${newAppt.doctorTitle}\n**Date:** ${newAppt.dateStr}\n**Time:** ${newAppt.timeStr}\n**Format:** ${newAppt.type === "video" ? "📹 Live Video Consultation" : "📞 Standard Voice Call"}\n${newAppt.notes ? `**Notes:** "${newAppt.notes}"\n` : ""}\n*You can join this room instantly from your consultation status block.*`,
      role: "system"
    });

    // Close scheduler
    setSchedulingVet(null);

    // Vet Response after delay
    setTimeout(() => {
      addMessage({
        text: `Consultation confirmed! 🦴 I have scheduled ${newAppt.timeStr} on ${dayObj.dayName} for our 1-on-1 discussion. Our automatic system will remind you precisely 15 minutes before our call kicks off!`,
        role: "vet",
        senderName: schedulingVet.name
      });
    }, 1500);
  };

  const handleCancelAppointment = (id: string, vetName: string) => {
    setAppointments(prev => prev.filter(a => a.id !== id));
    addMessage({
      text: `🚫 Consultation with ${vetName} has been cancelled successfully. Your time-slot has been released.`,
      role: "system"
    });
  };

  const handleStartCall = (appt: any) => {
    setActiveCallAppointment(appt);
  };
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Default seeded pet registry list
  const DEFAULT_REGISTRATIONS = [
    // Mumbai
    { id: "s1", ownerName: "Dhruv Aggarwal", city: "Mumbai", petType: "Dog", breed: "Golden Retriever", ageInWeeks: 12, preferenceLevel: "Active", createdAt: new Date(2026, 5, 1).toISOString() },
    { id: "s2", ownerName: "Aditi Sharma", city: "Mumbai", petType: "Dog", breed: "Golden Retriever", ageInWeeks: 12, preferenceLevel: "Guided", createdAt: new Date(2026, 5, 2).toISOString() },
    { id: "s3", ownerName: "Vikram Malhotra", city: "Mumbai", petType: "Dog", breed: "Golden Retriever", ageInWeeks: 16, preferenceLevel: "Minimal", createdAt: new Date(2026, 4, 15).toISOString() },
    { id: "s4", ownerName: "Rohan Mehra", city: "Mumbai", petType: "Dog", breed: "Beagle", ageInWeeks: 8, preferenceLevel: "Guided", createdAt: new Date(2026, 5, 5).toISOString() },
    { id: "s5", ownerName: "Pooja Patel", city: "Mumbai", petType: "Cat", breed: "Persian", ageInWeeks: 10, preferenceLevel: "Active", createdAt: new Date(2026, 5, 10).toISOString() },
    { id: "s5b", ownerName: "Karan Johar", city: "Mumbai", petType: "Cat", breed: "Persian", ageInWeeks: 10, preferenceLevel: "Guided", createdAt: new Date(2026, 5, 12).toISOString() },

    // Delhi
    { id: "s6", ownerName: "Ankit Gupta", city: "Delhi", petType: "Dog", breed: "German Shepherd", ageInWeeks: 20, preferenceLevel: "Active", createdAt: new Date(2026, 5, 1).toISOString() },
    { id: "s7", ownerName: "Meera Sen", city: "Delhi", petType: "Cat", breed: "Siamese", ageInWeeks: 14, preferenceLevel: "Guided", createdAt: new Date(2026, 5, 3).toISOString() },
    { id: "s8", ownerName: "Pranav Goel", city: "Delhi", petType: "Dog", breed: "Pug", ageInWeeks: 12, preferenceLevel: "Minimal", createdAt: new Date(2026, 5, 4).toISOString() },

    // Bangalore
    { id: "s9", ownerName: "Siddharth Nair", city: "Bangalore", petType: "Dog", breed: "Labrador", ageInWeeks: 14, preferenceLevel: "Active", createdAt: new Date(2026, 5, 2).toISOString() },
    { id: "s10", ownerName: "Sneha Reddy", city: "Bangalore", petType: "Cat", breed: "Indie Cat", ageInWeeks: 18, preferenceLevel: "Guided", createdAt: new Date(2026, 5, 5).toISOString() },
    { id: "s11", ownerName: "Rahul Hegde", city: "Bangalore", petType: "Dog", breed: "Labrador", ageInWeeks: 14, preferenceLevel: "Minimal", createdAt: new Date(2026, 5, 6).toISOString() },

    // Pune
    { id: "s12", ownerName: "Tejas Shinde", city: "Pune", petType: "Dog", breed: "French Bulldog", ageInWeeks: 16, preferenceLevel: "Guided", createdAt: new Date(2026, 5, 1).toISOString() },
    { id: "s13", ownerName: "Neha Kulkarni", city: "Pune", petType: "Cat", breed: "British Shorthair", ageInWeeks: 12, preferenceLevel: "Active", createdAt: new Date(2026, 5, 2).toISOString() }
  ];

  const getGroupedRegistrations = () => {
    const grouped: Record<string, Record<string, Record<string, Record<string, any[]>>>> = {};
    const listToCount = [...DEFAULT_REGISTRATIONS, ...dbRegistrations];
    
    listToCount.forEach((reg) => {
      const city = reg.city ? reg.city.trim() : "Unknown City";
      const petType = reg.petType ? reg.petType.trim() : "Dog";
      const breed = reg.breed ? reg.breed.trim() : "Other Breed";
      const age = reg.ageInWeeks ? `${reg.ageInWeeks} Weeks` : "Unknown Age";
      
      if (!grouped[city]) grouped[city] = {};
      if (!grouped[city][petType]) grouped[city][petType] = {};
      if (!grouped[city][petType][breed]) grouped[city][petType][breed] = {};
      if (!grouped[city][petType][breed][age]) grouped[city][petType][breed][age] = [];
      
      grouped[city][petType][breed][age].push(reg);
    });
    
    return grouped;
  };

  const getCityCount = (petTypes: any) => {
    let count = 0;
    Object.values(petTypes || {}).forEach((breeds: any) => {
      Object.values(breeds || {}).forEach((ages: any) => {
        Object.values(ages || {}).forEach((list: any) => {
          count += (list as any[]).length;
        });
      });
    });
    return count;
  };

  const getPetCount = (breeds: any) => {
    let count = 0;
    Object.values(breeds || {}).forEach((ages: any) => {
      Object.values(ages || {}).forEach((list: any) => {
        count += (list as any[]).length;
      });
    });
    return count;
  };

  const getBreedCount = (ages: any) => {
    let count = 0;
    Object.values(ages || {}).forEach((list: any) => {
      count += (list as any[]).length;
    });
    return count;
  };

  // Real-Time Database Connection & Setup States
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [dbRegistrations, setDbRegistrations] = useState<any[]>([]);
  const [isLoadingRegistry, setIsLoadingRegistry] = useState(false);
  const [rightSidebarTab, setRightSidebarTab] = useState<"clinical" | "registry" | "quickcommerce">("clinical");

  // Quick Commerce Integrations
  const [orders, setOrders] = useState<any[]>(() => {
    const saved = localStorage.getItem("rc_orders");
    return saved ? JSON.parse(saved) : [];
  });
  const [activeZeptoProduct, setActiveZeptoProduct] = useState<any | null>(null);
  const [isZeptoSyncing, setIsZeptoSyncing] = useState(false);
  const [zeptoSyncStep, setZeptoSyncStep] = useState(0);
  const [zeptoCheckoutApproved, setZeptoCheckoutApproved] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  useEffect(() => {
    localStorage.setItem("rc_orders", JSON.stringify(orders));
  }, [orders]);

  const saveOrderToFirestore = async (order: any) => {
    try {
      if (auth.currentUser) {
        const orderId = order.id || "order_" + Date.now();
        await setDoc(doc(db, "users", auth.currentUser.uid, "orders", orderId), {
          ...order,
          userId: auth.currentUser.uid,
          createdAt: new Date().toISOString()
        });
        console.log("[CareCircle] Order synchronized directly with Royal Canin Enterprise Dashboard Firestore DB:", orderId);
      }
    } catch (err) {
      console.error("[CareCircle] Failed to synchronize order with cloud DB:", err);
    }
  };

  const [expandedCities, setExpandedCities] = useState<Record<string, boolean>>({ "Mumbai": true });
  const [expandedPetTypes, setExpandedPetTypes] = useState<Record<string, boolean>>({});
  const [expandedBreeds, setExpandedBreeds] = useState<Record<string, boolean>>({});
  const [expandedAges, setExpandedAges] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsub();
  }, []);

  const fetchRegistrations = async () => {
    setIsLoadingRegistry(true);
    try {
      const qSnap = await getDocs(collection(db, "registrations"));
      const list: any[] = [];
      qSnap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setDbRegistrations(list);
    } catch (err) {
      console.warn("[CareCircle] Connecting to public backup/local registry because of read permissions limits.");
    } finally {
      setIsLoadingRegistry(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
  }, []);

  const saveRegistrationToFirestore = async (pData: any) => {
    try {
      const uId = auth.currentUser?.uid || "anon_" + Math.random().toString(36).substr(2, 9);
      const owner = auth.currentUser?.displayName || "CareCircle Member";
      
      const newReg = {
        ownerName: owner,
        city: pData.location || "Mumbai",
        petType: pData.petType || "Dog",
        breed: pData.breed || "Golden Retriever",
        ageInWeeks: Number(pData.ageInWeeks) || 12,
        preferenceLevel: pData.preferenceLevel || "Guided",
        createdAt: new Date().toISOString(),
        userId: uId
      };
      
      const regId = "reg_" + Date.now();
      await setDoc(doc(db, "registrations", regId), newReg);
      console.log("[CareCircle] Successfully uploaded registration record to Firestore db:", regId);
      
      // Auto switch tabs to highlight working
      setRightSidebarTab("registry");
      // Load updated registrations list from Firestore
      fetchRegistrations();
    } catch (err) {
      console.error("[CareCircle] Failed database registration upload:", err);
    }
  };

  const handleRestartApp = () => {
    localStorage.removeItem("rc_chat_messages");
    localStorage.removeItem("rc_onboarding_index");
    localStorage.removeItem("rc_puppy_data");
    localStorage.removeItem("rc_orders");
    setOrders([]);
    
    setMessages([
      {
        id: "welcome-1",
        text: "Welcome to Royal Canin CareCircle 🐾\nI’ll help you take care of your pet with vet-backed guidance.",
        timestamp: new Date(),
        role: "assistant",
        senderName: "CareCircle Assistant"
      }
    ]);
    setOnboardingIndex(-1);
    setPuppyData({ onboardingComplete: false, petType: "Dog", breed: "", ageInWeeks: "", location: "", preferenceLevel: "Guided" });
    setLastSummary(null);
    setVets([]);
    setActiveVet(null);
    setMapFocusedVet(null);
    setIsMobileMapOpen(false);
  };

  useEffect(() => {
    localStorage.setItem("rc_chat_messages", JSON.stringify(messages));
    if (messages.length > 0) {
      const summaryMsg = [...messages].reverse().find(m => m.text.includes("📋"));
      if (summaryMsg) setLastSummary(summaryMsg.text);
    }
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("rc_puppy_data", JSON.stringify(puppyData));
  }, [puppyData]);

  useEffect(() => {
    localStorage.setItem("rc_onboarding_index", onboardingIndex.toString());
  }, [onboardingIndex]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleTriggerZeptoSync = (product: any) => {
    setActiveZeptoProduct(product);
    setIsZeptoSyncing(true);
    setZeptoSyncStep(0);
    setZeptoCheckoutApproved(false);
    
    // Switch sidebars dynamically to make it highly noticeable and smooth!
    setRightSidebarTab("quickcommerce");

    // Simulate background transmission
    setTimeout(() => {
      setZeptoSyncStep(1); // reach carrier
      setTimeout(() => {
        setZeptoSyncStep(2); // complete sync
      }, 1500);
    }, 1500);
  };

  const handleCompleteZeptoCheckout = async () => {
    if (!activeZeptoProduct) return;
    
    const orderId = "RC-ORD-" + Math.floor(100000 + Math.random() * 900000);
    const invoiceNo = "RC-INV-" + Math.floor(10000 + Math.random() * 90000);
    
    const newOrder = {
      id: orderId,
      productName: activeZeptoProduct.name,
      price: activeZeptoProduct.price,
      size: activeZeptoProduct.size,
      status: "Packing",
      timestamp: new Date().toISOString(),
      invoiceNo: invoiceNo
    };

    setOrders(prev => [newOrder, ...prev]);
    setIsZeptoSyncing(false);
    setActiveZeptoProduct(null);

    // Sync directly to the cloud store registrations / database tracking if signed in
    await saveOrderToFirestore(newOrder);

    addMessage({
      text: `🛒 **ZEPTO PRODUCT AUTO-ADDED & PURCHASED**\n\n• **Order:** ${newOrder.productName}\n• **Billing amount:** ₹${newOrder.price}\n• **Status:** Staged inside Zepto fulfillment center. Ready for near-instant dispatch! 🛵\n\n*The transaction invoice is ready. Open 'Zepto Hub' tab to inspect details.*`,
      role: "assistant",
      senderName: "CareCircle Order Sync"
    });
  };

  // Live delivery tracking simulation interval loop
  useEffect(() => {
    const activeOrder = orders.find(o => o.status === "Packing" || o.status === "Rider Dispatched");
    if (!activeOrder) return;

    const timer = setTimeout(() => {
      setOrders(prev => prev.map(o => {
        if (o.id === activeOrder.id) {
          if (o.status === "Packing") {
            return { ...o, status: "Rider Dispatched" };
          }
          if (o.status === "Rider Dispatched") {
            // Push active delivered alert inside WhatsApp room
            setTimeout(() => {
              addMessage({
                text: `🔔 **ZEPTO EXPRESS DELIVERED**\n\nYour prescribed diet package **${o.productName}** has just been safely delivered to your doorstep! 🛵💨\n\n*Verified by Royal Canin CareCircle.*`,
                role: "system"
              });
            }, 500);
            return { ...o, status: "Delivered 🎉" };
          }
        }
        return o;
      }));
    }, 7000); // Step every 7 seconds for ultra rapid delightful preview!

    return () => clearTimeout(timer);
  }, [orders]);

  const addMessage = (msg: Omit<Message, "id" | "timestamp">) => {
    setMessages(prev => [...prev, {
      ...msg,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date()
    }]);
    if (msg.text.includes("📋")) {
      setLastSummary(msg.text);
    }
  };

  const handleSend = async (text: string) => {
    const cmd = text.toUpperCase().trim();
    addMessage({ text, role: "user" });

    // 1. Check for absolute commands first (bypasses onboarding check)
    const words = cmd.split(" ");
    const hasVetKeyword = words.includes("VET") || words.includes("VETS") || words.includes("VETERINARY") || words.includes("CLINIC");
    
    // Check if it's "VET IN [CITY]" or just a city name
    let detectedLocation = "";
    if (cmd.startsWith("VET IN ")) {
      detectedLocation = text.substring(7).trim();
    } else if (hasVetKeyword && words.length > 1) {
      // Possible city mentioned like "VET MUMBAI"
      detectedLocation = words.find(w => w !== "VET" && w !== "VETS" && w !== "FIND" && w !== "NEARBY" && w !== "IN") || "";
    } else if (onboardingIndex === -2) {
      // Check if the single word or short phrase is an Indian city keyword (basic check)
      const majorCities = ["DELHI", "MUMBAI", "CHENNAI", "KOLKATA", "BANGALORE", "HYDERABAD", "PUNE", "AHMEDABAD", "JAIPUR", "CHANDIGARH", "LUCKNOW"];
      if (majorCities.includes(cmd) || (words.length <= 2 && (cmd.includes("CITY") || cmd.includes("TOWN")))) {
        detectedLocation = text.trim();
      } else if (words.length === 1) {
        const knownCommands = ["FOOD", "TRACK", "HELP", "VET", "VETS"];
        if (!knownCommands.includes(cmd)) detectedLocation = text.trim();
      }
    }

    const isVetCmd = hasVetKeyword || cmd === "FIND VETS" || cmd.includes("CONNECT TO VET") || cmd.includes("VET OPTIONS") || cmd.includes("FIND VET") || cmd.includes("SHOW VETS") || cmd.includes("NEARBY VETS");
    
    if (isVetCmd || (detectedLocation && detectedLocation.length > 2)) { 
      console.log(`[CareCircle] VET intent detected: ${cmd}, location: ${detectedLocation}`);
      handleVetFetch(detectedLocation); 
      return; 
    }
    
    if (cmd.includes("ORDER") || cmd === "BUY" || cmd === "PURCHASE" || cmd === "ZEPTO" || cmd.includes("BUY FORMULATION") || cmd.includes("BUY PRODUCT")) {
      const petType = puppyData.petType?.toLowerCase() === "cat" ? "cat" : "dog";
      const products = PRODUCTS_DB[petType] || PRODUCTS_DB.dog;
      addMessage({
        text: "", // No conversational fluff - only the direct card options as requested by user
        role: "assistant",
        senderName: "Zepto Quick Commerce",
        isQuickCommerce: true,
        recommendedProducts: products
      });
      return;
    }

    if (cmd === "FOOD") {
      addMessage({
        text: `Based on your ${puppyData.breed || "puppy"}'s age (${puppyData.ageInWeeks || "0"} weeks), we recommend:\n\n• Feed 3-4 times a day\n• Use high-quality puppy kibble\n• Monitor weight gain weekly\n\nI have prepared a tailored Diet Plan for you. Click below to download the PDF.`,
        role: "assistant",
        senderName: "CareCircle Assistant",
        isDietPlan: true
      });
      return;
    }
    
    if (cmd === "TRACK" || cmd.includes("HEALTH TRACKER")) {
      addMessage({
        text: "I have prepared your puppy's Health Tracker report. It includes all your recent summaries and alerts. You can download the PDF below.",
        role: "assistant",
        senderName: "CareCircle Assistant",
        isHealthTracker: true
      });
      return;
    }

    if (cmd === "HELP") {
      addMessage({
        text: "I can help with:\n• 'VET' - Nearby clinics\n• 'FOOD' - Nutrition advice\n• 'TRACK' - Health logs",
        role: "assistant"
      });
      return;
    }

    // 2. Handle onboarding
    if (!puppyData.onboardingComplete) {
      if (text === "New Puppy Setup" || onboardingIndex === -1) {
        startOnboarding();
        return;
      }
      const currentStep = ONBOARDING_STEPS[onboardingIndex];
      const nextData = { ...puppyData, [currentStep.field]: text };
      setPuppyData(nextData);
      if (onboardingIndex < ONBOARDING_STEPS.length - 1) {
        const nextStep = ONBOARDING_STEPS[onboardingIndex + 1];
        const optionsStr = nextStep.options ? `\n\nChoose an option:\n${nextStep.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}` : "";
        setTimeout(() => {
          addMessage({ text: nextStep.question + optionsStr, role: "assistant", senderName: "CareCircle Assistant" });
          setOnboardingIndex(onboardingIndex + 1);
        }, 600);
      } else {
        const finalData = { ...nextData, onboardingComplete: true };
        setPuppyData(finalData);
        setOnboardingIndex(-2);
        saveRegistrationToFirestore(finalData);
        setTimeout(() => {
          addMessage({
            text: `Amazing! You're all set. 🐾 Real-time record uploaded to database!\n\nYou can now ask me anything, or use these commands:\n\n'VET' - Nearby vets\n'FOOD' - Feeding plan\n'HELP' - All commands`,
            role: "assistant",
            senderName: "CareCircle Assistant"
          });
          addMessage({ text: "ONBOARDING COMPLETE", role: "system" });
        }, 1000);
      }
      return;
    }

    // 3. Handle affirmative responses for vet fetching (if a suggestion was just made)
    const isAffirmative = ["YES", "SURE", "OK", "FETCH", "CONTINUE"].some(word => cmd.includes(word));
    const lastMsg = messages[messages.length - 1];
    if (isAffirmative && lastMsg?.text.toLowerCase().includes("nearby options")) {
      handleVetFetch();
      return;
    }

    // 4. AIS-powered triage
    const triage = await triagePuppyQuery(text, puppyData);
    setTimeout(() => {
      addMessage({ text: triage.advice, role: "assistant", senderName: "CareCircle Assistant" });
      if (triage.suggestVet) {
        addMessage({ text: "I suggest connecting with a vet for a professional assessment. Should I fetch nearby options?", role: "assistant", senderName: "CareCircle Assistant" });
        // Auto-fetch if triage strongly suggests it and it looks like a location search
        if (text.toLowerCase().includes("vet") || text.toLowerCase().includes("clinic")) {
           handleVetFetch();
        }
      }
    }, 800);
  };

  const generateVetSummary = () => {
    addMessage({ text: "Generating Vet-Verified Summary...", role: "system" });
    setTimeout(() => {
      const summaryText = `📋 **VET VERIFIED ADVICE**\n\n**Patient:** ${puppyData.breed} (${puppyData.ageInWeeks} weeks)\n**Status:** Consultation completed\n\n**Actionable Steps:**\n• Follow the feeding plan provided\n• Monitor activity levels for 24h\n• Schedule follow-up in 2 weeks\n\n*This summary is shareable for your records.*`;
      addMessage({
        text: summaryText,
        role: "assistant",
        senderName: "CareCircle Summary"
      });

      // Add a system button for the Medical Report PDF
      addMessage({
        text: "Your medical consultation report is ready.",
        role: "system",
        isDietPlan: false, // I can reuse isDietPlan or create isMedicalReport
      });

      // Suggest the perfect Royal Canin Diet Prescribed Product
      const recProduct = getRecommendedProductForProfile(puppyData);
      addMessage({
        text: `Prescribing **${recProduct.name}** (${recProduct.size}) for your ${puppyData.breed}.\n\nThis formula was specifically selected by our clinic to support this stage of life. Click 'Buy Product' below to enable background synchronization with Zepto Express delivery.`,
        role: "vet",
        senderName: activeVet?.name || "CareCircle Veterinary Team",
        isQuickCommerce: true,
        recommendedProduct: recProduct
      });
      
      // Trigger rating prompt after a short delay
      setTimeout(() => {
        addMessage({
          text: "RATING_PROMPT",
          role: "assistant",
          isRating: true
        });
      }, 3000);
    }, 1500);
  };

  const handleRate = (rating: number) => {
    addMessage({ text: `User rated ${rating} stars`, role: "system" });
    setTimeout(() => {
      addMessage({
        text: `Thank you for rating! This helps us improve our care network. Would you like to save this summary to your puppy's medical tracker?`,
        role: "assistant",
        senderName: "CareCircle Assistant"
      });
    }, 1000);
  };

  const startOnboarding = () => {
    setOnboardingIndex(0);
    const firstStep = ONBOARDING_STEPS[0];
    const optionsStr = firstStep.options ? `\n\nChoose an option:\n${firstStep.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}` : "";
    addMessage({ text: firstStep.question + optionsStr, role: "assistant", senderName: "CareCircle Assistant" });
  };

  const handleVetFetch = async (locationOverride?: string) => {
    setIsLoadingVets(true);
    const location = locationOverride || puppyData.location || "your area";
    const city = location === "your area" ? "Mumbai" : location;
    
    // Update the puppy data location if a new one was provided
    if (locationOverride) {
      setPuppyData(prev => ({ ...prev, location: locationOverride }));
    }
    
    addMessage({ 
      text: `Scanning for top-rated veterinary clinics in ${city}...`, 
      role: "assistant",
      senderName: "CareCircle Assistant"
    });

    try {
      // Simulate network delay for realistic experience
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      const response = await fetch(`/api/vets/match?location=${encodeURIComponent(city)}`);
      const data = await response.json();
      
      setVets(data);
      
      if (data && data.length > 0) {
        addMessage({ 
          text: `I've found ${data.length} highly recommended clinics in ${city}. You can choose one to start a digital consultation.`, 
          role: "assistant", 
          senderName: "CareCircle Assistant", 
          isVetList: true,
          vets: data
        });
      } else {
        throw new Error("Empty results");
      }
    } catch (e) {
      console.error("[CareCircle] Vet fetch error:", e);
      // Ultimate fallback with local data for demo stability
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
      const isMumbai = norm === "mumbai";
      let base = CITY_COORDS[norm];
      if (!base) {
        let hash = 0;
        for (let i = 0; i < norm.length; i++) {
          hash = norm.charCodeAt(i) + ((hash << 5) - hash);
        }
        const latOffset = (Math.abs(hash) % 100) / 2000 - 0.025;
        const lngOffset = (Math.abs(hash >> 8) % 100) / 2000 - 0.025;
        base = { lat: 19.0760 + latOffset, lng: 72.8777 + lngOffset };
      }

      const fallbackData = [
        { 
          id: "f1", 
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
          id: "f2", 
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
          id: "f3", 
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
      setVets(fallbackData);
      addMessage({ 
        text: `Based on your request for ${city}, here are our top-rated puppy care partners ready for consultation:`, 
        role: "assistant",
        senderName: "CareCircle Assistant",
        isVetList: true,
        vets: fallbackData
      });
    } finally {
      setIsLoadingVets(false);
    }
  };

  const simulateAlert = async (type: string) => {
    console.log(`[CareCircle] Simulating alert: ${type}`);
    addMessage({ text: `SIMULATING ${type.toUpperCase()} ALERT`, role: "system" });
    try {
      const response = await fetch("/api/simulate-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          type, 
          breed: puppyData.breed || "Puppy", 
          age: puppyData.ageInWeeks || 8 
        })
      });
      if (!response.ok) throw new Error(`Simulation failed with status: ${response.status}`);
      const data = await response.json();
      console.log(`[CareCircle] Alert data received:`, data);
      setTimeout(() => {
        addMessage({ text: `🚨 ${data.message || "General care alert issued for your puppy."}`, role: "assistant", senderName: "CareCircle Alert" });
      }, 500);
    } catch (e) {
      console.error("[CareCircle] Alert simulation error:", e);
      addMessage({ text: "Alert simulation failed. Ensure your puppy's breed and age are set.", role: "system" });
    }
  };

  const renderMapBox = () => {
    if (!hasValidGoogleMapsKey) {
      return (
        <div className="bg-gray-50 border border-dashed border-red-200 rounded-xl p-4 text-center">
          <div className="w-8 h-8 bg-red-50 text-rc-red rounded-full flex items-center justify-center mx-auto mb-2 animate-pulse">
            <MapPin className="w-4 h-4 text-rc-red" />
          </div>
          <h4 className="text-[10px] font-black uppercase text-red-700 tracking-wider mb-1 text-center">Google Maps Setup Required</h4>
          <p className="text-[9px] text-gray-400 mb-3 leading-relaxed text-center">
            Link your real Google Cloud Maps key as an environment secret inside AI Studio to activate coordinates routing.
          </p>
          <div className="bg-white border border-gray-100 p-2 rounded text-[7.5px] text-left text-gray-500 font-medium space-y-1">
            <p><strong>1.</strong> Press Settings (⚙️ gear icon, <strong>top-right corner</strong>)</p>
            <p><strong>2.</strong> Choose <strong>Secrets</strong> panel</p>
            <p><strong>3.</strong> Name: <code className="bg-gray-100 px-1 py-0.5 rounded text-rc-red font-bold select-all">GOOGLE_MAPS_PLATFORM_KEY</code></p>
            <p><strong>4.</strong> Value: Paste your Google developer API Key.</p>
          </div>
          <p className="text-[7.5px] text-gray-400 mt-2 italic text-center font-semibold">The app builds automatically on key save.</p>
        </div>
      );
    }

    return (
      <div className="h-[210px] w-full rounded-xl border border-gray-200 overflow-hidden relative shadow-sm">
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
          <GoogleMap
            center={mapCenter}
            zoom={mapZoom}
            mapId="DEMO_MAP_ID"
            gestureHandling="cooperative"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
          >
            {vets.map((v) => {
              if (!v.lat || !v.lng) return null;
              const isSelected = mapFocusedVet?.id === v.id;
              return (
                <AdvancedMarker
                  key={v.id}
                  position={{ lat: Number(v.lat), lng: Number(v.lng) }}
                  onClick={() => {
                    setMapFocusedVet(v);
                    setMapCenter({ lat: Number(v.lat), lng: Number(v.lng) });
                    setIsInfoWindowOpen(true);
                  }}
                >
                  <Pin 
                    background={isSelected ? "#E11D48" : "#22C55E"} 
                    borderColor={isSelected ? "#BE123C" : "#16A34A"}
                    glyphColor="#fff" 
                  />
                </AdvancedMarker>
              );
            })}

            {isInfoWindowOpen && mapFocusedVet && mapFocusedVet.lat && mapFocusedVet.lng && (
              <InfoWindow
                position={{ lat: Number(mapFocusedVet.lat), lng: Number(mapFocusedVet.lng) }}
                onCloseClick={() => {
                  setIsInfoWindowOpen(false);
                  setMapFocusedVet(null);
                }}
              >
                <div className="p-1 max-w-[170px] text-gray-800">
                  <p className="text-[9.5px] font-black text-slate-900 leading-tight m-0">{mapFocusedVet.name}</p>
                  <p className="text-[8px] text-slate-500 m-0 mt-0.5">{mapFocusedVet.location}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[8px] font-bold text-[#E11D48] bg-rose-50 px-1 py-0.5 rounded">★ {mapFocusedVet.rating}</span>
                    <span className="text-[8px] text-slate-400">({mapFocusedVet.ratingCount})</span>
                    <span className="text-[8px] font-bold text-green-700 ml-auto">{mapFocusedVet.distance}</span>
                  </div>
                  <button
                    onClick={() => {
                      addMessage({ 
                        text: `🚗 **LAUNCH CONSOLE DIRECTIONS**\n\nStarting GPS guide back to **${mapFocusedVet.name}**'s clinic in *${mapFocusedVet.location}*.\n\n🛣️ Route initialized properly!`, 
                        role: "system" 
                      });
                    }}
                    className="w-full mt-1.5 py-0.5 bg-green-600 text-white font-extrabold rounded-md text-[7.5px] uppercase tracking-wider block text-center"
                  >
                    Start Directions
                  </button>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </APIProvider>
      </div>
    );
  };

  const renderMobileMapBox = () => {
    if (!hasValidGoogleMapsKey) {
      return (
        <div className="absolute inset-0 flex flex-col justify-center items-center bg-gray-50 p-4 text-center">
          <MapPin className="w-8 h-8 text-rc-red/60 mb-2 animate-bounce" />
          <h4 className="text-[10px] font-black uppercase text-gray-800 mb-1">Google Maps Inactive</h4>
          <p className="text-[9px] text-gray-400 max-w-[210px] leading-relaxed">
            Please configure your secret <code className="bg-gray-150 text-rc-red px-1 rounded font-bold">GOOGLE_MAPS_PLATFORM_KEY</code> in settings to render real interactive satellite coordinate traces.
          </p>
        </div>
      );
    }

    return (
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
        <GoogleMap
          center={mapCenter}
          zoom={mapZoom}
          mapId="DEMO_MAP_ID"
          gestureHandling="greedy"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          {vets.map((v) => {
            if (!v.lat || !v.lng) return null;
            const isSelected = mapFocusedVet?.id === v.id;
            return (
              <AdvancedMarker
                key={v.id}
                position={{ lat: Number(v.lat), lng: Number(v.lng) }}
                onClick={() => {
                  setMapFocusedVet(v);
                  setMapCenter({ lat: Number(v.lat), lng: Number(v.lng) });
                  setIsInfoWindowOpen(true);
                }}
              >
                <Pin 
                  background={isSelected ? "#E11D48" : "#22C55E"} 
                  borderColor={isSelected ? "#BE123C" : "#16A34A"}
                  glyphColor="#fff" 
                />
              </AdvancedMarker>
            );
          })}

          {isInfoWindowOpen && mapFocusedVet && mapFocusedVet.lat && mapFocusedVet.lng && (
            <InfoWindow
              position={{ lat: Number(mapFocusedVet.lat), lng: Number(mapFocusedVet.lng) }}
              onCloseClick={() => {
                setIsInfoWindowOpen(false);
                setMapFocusedVet(null);
              }}
            >
              <div className="p-1 max-w-[150px] text-gray-800">
                <p className="text-[9px] font-black text-slate-900 leading-none m-0">{mapFocusedVet.name}</p>
                <p className="text-[7.5px] text-slate-550 m-0 mt-0.5 font-medium">{mapFocusedVet.location}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[7.5px] font-black text-[#E11D48]">★ {mapFocusedVet.rating}</span>
                  <span className="text-[7.5px] font-bold text-green-700 ml-auto">{mapFocusedVet.distance}</span>
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </APIProvider>
    );
  };

  return (
    <div className="w-full h-screen bg-system-bg text-[#2D3436] font-sans flex flex-col overflow-hidden">
      {/* Header: Brand & System Status */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center z-20">
        <div className="flex items-center gap-4">
          <div className="bg-rc-red text-white font-bold p-2 px-3 rounded shadow-sm">RC</div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-rc-red">Royal Canin CareCircle</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Product Engineering Dashboard & System Preview</p>
          </div>
        </div>
        <div className="flex gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-400 uppercase font-bold">System Status</span>
            <span className="flex items-center gap-2 text-sm font-medium text-green-600">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> WhatsApp API Active
            </span>
          </div>
          <div className="flex flex-col items-end border-l border-gray-200 pl-6">
            <span className="text-[10px] text-gray-400 uppercase font-bold">Connected Vets</span>
            <span className="text-sm font-medium">124 Available</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Column: Architecture & Data Logic */}
        <aside className="w-72 bg-panel-bg border-r border-gray-200 p-6 flex flex-col gap-6 overflow-y-auto">
          <div>
            <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-3 tracking-wider">Logic Layers</h3>
            <ul className="space-y-3">
              <li className="bg-white p-3 rounded shadow-sm border-l-4 border-rc-red">
                <div className="text-sm font-bold">AI Triage Layer</div>
                <div className="text-[10px] text-gray-500 uppercase mt-0.5">Gemini-3-Flash • Rule-Based</div>
              </li>
              <li className="bg-white p-3 rounded shadow-sm border-l-4 border-gray-300">
                <div className="text-sm font-bold">Trigger Engine</div>
                <div className="text-[10px] text-gray-500 uppercase mt-0.5">Vite + React Flow</div>
              </li>
              <li className="bg-white p-3 rounded shadow-sm border-l-4 border-gray-300">
                <div className="text-sm font-bold">Escalation Hub</div>
                <div className="text-[10px] text-gray-500 uppercase mt-0.5">Vet-Connected 1:1 Tunnel</div>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-3 tracking-wider">Prototype Controls</h3>
            <div className="space-y-2">
              <button 
                onClick={() => simulateAlert("weather")}
                className="w-full flex items-center justify-between bg-orange-50 p-2 rounded border border-orange-100 hover:bg-orange-100 transition-colors"
                title="Simulate Weather Alert"
              >
                <span className="text-[10px] font-bold text-orange-700 uppercase">Trigger Weather Alert</span>
                <Bell className="w-3.5 h-3.5 text-orange-600" />
              </button>
              <button 
                onClick={() => simulateAlert("lifecycle")}
                className="w-full flex items-center justify-between bg-blue-50 p-2 rounded border border-blue-100 hover:bg-blue-100 transition-colors"
                title="Simulate Lifecycle Alert"
              >
                <span className="text-[10px] font-bold text-blue-700 uppercase">Trigger Growth Alert</span>
                <Info className="w-3.5 h-3.5 text-blue-600" />
              </button>
              <button 
                onClick={() => simulateAlert("nutrition")}
                className="w-full flex items-center justify-between bg-green-50 p-2 rounded border border-green-100 hover:bg-green-100 transition-colors"
                title="Simulate Nutrition Alert"
              >
                <span className="text-[10px] font-bold text-green-700 uppercase">Trigger Nutrition Tip</span>
                <Bell className="w-3.5 h-3.5 text-green-600" />
              </button>

              <button 
                onClick={handleTriggerMock15mReminder}
                className="w-full flex items-center justify-between bg-red-50 p-2 rounded border border-red-100 hover:bg-red-100 transition-colors cursor-pointer"
                title="Trigger 15m Consultation Reminder Demo"
              >
                <div className="flex flex-col text-left">
                  <span className="text-[10px] font-bold text-rc-red uppercase">Trigger 15m Vet Alert</span>
                  <span className="text-[7.5px] text-gray-400 uppercase font-bold tracking-tight">Tests background poll instantly</span>
                </div>
                <Clock className="w-4 h-4 text-rc-red animate-pulse" />
              </button>
              
              <div className="pt-2 border-t border-gray-100 mt-2 space-y-2">
                <button 
                  onClick={handleRestartApp}
                  className="w-full py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rc-red rounded-lg text-[10px] font-extrabold uppercase transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 animate-spin-once" /> Restart WhatsApp Flow
                </button>
                <button 
                  onClick={() => {
                    localStorage.clear();
                    window.location.reload();
                  }}
                  className="w-full py-2 border border-dashed border-gray-200 hover:bg-gray-50 text-gray-400 rounded-lg text-[9px] font-bold uppercase transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                >
                  Clear User Session
                </button>
              </div>
            </div>
          </div>

          <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100">
            <h4 className="text-[10px] font-black uppercase text-emerald-800 tracking-wider mb-2 flex items-center gap-1 select-none">
              🥗 Nutrition & Diet Hub
            </h4>
            <p className="text-[9px] text-[#2D3436]/70 leading-relaxed mb-3">
              Trigger customized nutrition recommendations & download printable certified diet charts.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  addMessage({
                    text: `Based on your ${puppyData.breed || "puppy"}'s age (${puppyData.ageInWeeks || "12"} weeks), we recommend:\n\n• Feed 3-4 times a day\n• Use high-quality puppy kibble\n• Monitor weight gain weekly\n\nI have prepared a tailored Diet Plan for you. Click below to download the PDF.`,
                    role: "assistant",
                    senderName: "CareCircle Assistant",
                    isDietPlan: true
                  });
                }}
                className="py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold rounded-md text-[8.5px] uppercase tracking-wide text-center cursor-pointer transition-all shadow-xs"
              >
                Send Chart
              </button>
              <button
                onClick={() => generateDietPDF(puppyData)}
                className="py-1.5 bg-white border border-emerald-200 hover:bg-emerald-50 active:scale-95 text-emerald-700 font-extrabold rounded-md text-[8.5px] uppercase tracking-wide text-center cursor-pointer transition-all"
              >
                Download PDF
              </button>
            </div>
          </div>

          <div className="mt-auto">
            <div className="bg-[#2D3436] text-white p-4 rounded-lg shadow-inner">
              <p className="text-[10px] opacity-50 uppercase font-bold text-green-400">Database Schema</p>
              <code className="text-[10px] block mt-2 font-mono leading-tight">
                user_id: string<br />
                breed: {puppyData.breed || "null"}<br />
                age: {puppyData.ageInWeeks || 0}<br />
                pref: {puppyData.preferenceLevel?.toUpperCase() || "MINIMAL"}
              </code>
            </div>
          </div>
        </aside>

        {/* Middle Column: The WhatsApp Prototype Experience */}
        <section className="flex-1 p-8 flex justify-center items-center bg-wa-bg overflow-hidden relative">
          {/* Mobile Phone Frame */}
          <div className="w-[320px] h-full max-h-[640px] bg-white rounded-[40px] border-[8px] border-[#2D3436] shadow-2xl relative flex flex-col overflow-hidden">
            {/* Elegant Floating OS Notification Banner */}
            <AnimatePresence>
              {activeNotification && (
                <motion.div
                  initial={{ opacity: 0, y: -100, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -60, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  className="absolute top-4 left-3 right-3 bg-slate-900/95 backdrop-blur border border-white/15 p-3 rounded-2xl shadow-xl z-50 text-white flex flex-col gap-1.5"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-1.5">
                      <div className="bg-rc-red text-white p-1 rounded-lg">
                        <Bell className="w-3.5 h-3.5 fill-white text-white" />
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-widest text-[#FDA4AF] font-bold">15m Consultation Reminder</p>
                        <h4 className="text-[10px] font-black tracking-tight">{activeNotification.title}</h4>
                      </div>
                    </div>
                    <button 
                      onClick={() => setActiveNotification(null)}
                      className="text-white/40 hover:text-white p-0.5 rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  
                  <p className="text-[9.5px] text-gray-300 leading-snug">
                    {activeNotification.body}
                  </p>
                  
                  <div className="flex gap-1.5 mt-1">
                    <button
                      onClick={() => {
                        handleStartCall(activeNotification.appt);
                        setActiveNotification(null);
                      }}
                      className="flex-1 py-1 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-extrabold rounded-md text-[8.5px] uppercase tracking-wider text-center cursor-pointer transition-all"
                    >
                      Join Room Now
                    </button>
                    <button
                      onClick={() => setActiveNotification(null)}
                      className="hover:bg-white/10 text-white font-bold rounded-md text-[8.5px] uppercase tracking-wider text-center cursor-pointer px-2 transition-all"
                    >
                      Dismiss
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mobile Status Bar */}
            <div className="h-6 bg-wa-teal w-full flex justify-between px-6 pt-1 text-white text-[10px] font-medium">
              <span>9:41</span>
              <div className="flex gap-1.5 items-center">
                <span className="w-2.5 h-2.5 border-b-2 border-white rounded-full"></span>
                <span>LTE</span>
                <span>100%</span>
              </div>
            </div>
            
            {/* Chat Header */}
            <div className="bg-wa-teal p-3 flex items-center justify-between shadow-md select-none">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center font-bold text-rc-red shadow-sm overflow-hidden border border-white/20">
                  <img src="https://www.royalcanin.com/favicon.ico" className="w-6 h-6 object-contain" alt="logo" />
                </div>
                <div>
                  <div className="text-white text-sm font-bold">RC CareCircle</div>
                  <div className="text-white opacity-75 text-[10px] font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span> 
                    Always Active 🐾
                  </div>
                </div>
              </div>
              <button
                onClick={handleRestartApp}
                className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors cursor-pointer"
                title="Restart WhatsApp Chat Flow"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Chat Body */}
            <div 
              ref={scrollRef}
              className="flex-1 p-4 flex flex-col gap-1 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-repeat overflow-y-auto chat-scroll"
            >
              <div className="flex justify-center mb-4">
                <span className="bg-white/80 border border-gray-100 text-[#111B21]/60 text-[9px] px-2 py-0.5 rounded shadow-sm font-bold uppercase">
                  Today
                </span>
              </div>

              <AnimatePresence>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full"
                  >
                    <ChatBubble text={msg.text} timestamp={msg.timestamp} role={msg.role} senderName={msg.senderName} />
                    {msg.isDietPlan && (
                      <div className="ml-1 mb-4 max-w-[85%] self-start">
                        <button 
                          onClick={() => generateDietPDF(puppyData)}
                          className="w-full bg-rc-red text-white py-2 px-4 rounded-xl text-[10px] font-bold uppercase tracking-wider shadow-sm hover:bg-rc-red/90 transition-all flex items-center justify-center gap-2"
                        >
                          Download Diet Plan PDF
                        </button>
                      </div>
                    )}
                    {msg.isHealthTracker && (
                      <div className="ml-1 mb-4 max-w-[85%] self-start">
                        <button 
                          onClick={() => generateHealthTrackerPDF(puppyData, messages)}
                          className="w-full bg-slate-700 text-white py-2 px-4 rounded-xl text-[10px] font-bold uppercase tracking-wider shadow-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                        >
                          Download Health Tracker PDF
                        </button>
                      </div>
                    )}
                    {msg.isQuickCommerce && msg.recommendedProduct && (
                      <div className="ml-1 mb-4 max-w-[85%] self-start bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col gap-3 select-none">
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-[8px] uppercase tracking-wider bg-red-100 text-rc-red px-2 py-0.5 rounded-full font-black font-mono">
                            {msg.recommendedProduct.badge}
                          </span>
                          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tight">{msg.recommendedProduct.size}</span>
                        </div>
                        <div className="flex gap-3">
                          <img 
                            src={msg.recommendedProduct.image} 
                            alt={msg.recommendedProduct.name}
                            referrerPolicy="no-referrer"
                            className="w-16 h-16 rounded-xl object-cover bg-white p-1 border border-slate-200/50 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-black text-slate-800 leading-tight">{msg.recommendedProduct.name}</h4>
                            <p className="text-[9.5px] text-slate-500 leading-snug mt-1 italic font-medium">
                              "{msg.recommendedProduct.desc}"
                            </p>
                            <div className="flex items-center gap-1.5 mt-2">
                              <span className="text-xs font-black text-rc-red">₹{msg.recommendedProduct.price}</span>
                              <span className="text-[8.5px] text-gray-400 line-through font-medium">₹{Math.round(msg.recommendedProduct.price * 1.25)}</span>
                              <span className="text-[8px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-black uppercase">Save 20%</span>
                            </div>
                          </div>
                        </div>

                        {/* Order button or Live Sync Stepper */}
                        {activeZeptoProduct?.id === msg.recommendedProduct.id && isZeptoSyncing ? (
                          <div className="bg-purple-50/60 p-3 rounded-xl border border-purple-100 flex flex-col gap-3.5 mt-1 select-none">
                            <div className="flex justify-between items-center text-[8.5px] font-black uppercase text-purple-900 tracking-wider">
                              <span className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-ping" />
                                Syncing with Zepto...
                              </span>
                              <span>Step {zeptoSyncStep + 1}/3</span>
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-extrabold shrink-0",
                                  zeptoSyncStep >= 0 ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-400"
                                )}>
                                  {zeptoSyncStep > 0 ? "✓" : "1"}
                                </div>
                                <span className={cn("text-[10px] font-bold", zeptoSyncStep >= 0 ? "text-slate-800" : "text-slate-400")}>
                                  Parsing clinic formulation
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-extrabold shrink-0",
                                  zeptoSyncStep >= 1 ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-400"
                                )}>
                                  {zeptoSyncStep > 1 ? "✓" : "2"}
                                </div>
                                <span className={cn("text-[10px] font-bold", zeptoSyncStep >= 1 ? "text-slate-800" : "text-slate-400")}>
                                  Mapping Zepto warehouse stock
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-extrabold shrink-0",
                                  zeptoSyncStep >= 2 ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"
                                )}>
                                  {zeptoSyncStep >= 2 ? "✓" : "3"}
                                </div>
                                <span className={cn("text-[10px] font-bold", zeptoSyncStep >= 2 ? "text-emerald-700 font-extrabold animate-pulse" : "text-slate-400")}>
                                  {zeptoSyncStep >= 2 ? "Sync Finished! Checkout live" : "Locking dispatch slot"}
                                </span>
                              </div>
                            </div>

                            {zeptoSyncStep >= 2 && (
                              <button
                                onClick={handleCompleteZeptoCheckout}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold uppercase tracking-widest py-3 px-4 rounded-xl text-[10px] shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer border-0"
                              >
                                ⚡ COMPLETE UPI CHECKOUT (₹{msg.recommendedProduct.price})
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleTriggerZeptoSync(msg.recommendedProduct)}
                            className="w-full bg-linear-to-r from-rc-red to-[#be123c] hover:opacity-95 text-white font-extrabold uppercase tracking-widest py-2.5 px-4 rounded-xl text-[9px] shadow-xs active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer border-0"
                          >
                            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                              <path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2v-8.03c2.09-.13 3.75-1.85 3.75-3.97V22h-2v-7zm8-3h-1v4h1v10h2V6c0-1.66-1.34-3-3-3h-1v3h2z"/>
                            </svg>
                            Buy Product (Auto-Sync Zepto)
                          </button>
                        )}
                      </div>
                    )}
                    {msg.isQuickCommerce && msg.recommendedProducts && (
                      <div className="ml-1 mb-4 max-w-[85%] self-start bg-white rounded-2xl p-4 border border-slate-200/85 shadow-xs flex flex-col gap-4 select-none animate-fade-in text-slate-800">
                        <div className="border-b border-slate-100 pb-2">
                          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            🛵 Select Pet Diet formulation
                          </h3>
                        </div>
                        <div className="flex flex-col gap-3.5">
                          {msg.recommendedProducts.map((prod) => (
                            <div key={prod.id} className="border border-slate-100 bg-slate-50/50 p-3 rounded-xl flex flex-col gap-3 select-none">
                              <div className="flex gap-2.5">
                                <img 
                                  src={prod.image} 
                                  alt={prod.name}
                                  referrerPolicy="no-referrer"
                                  className="w-14 h-14 rounded-lg object-cover bg-white p-0.5 border border-slate-200/35 flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1 mb-0.5">
                                    <span className="text-[7.5px] uppercase tracking-wide bg-red-50 text-rc-red px-1.5 py-0.2 rounded font-black font-mono truncate">
                                      {prod.badge}
                                    </span>
                                    <span className="text-[8px] text-gray-400 font-bold shrink-0">{prod.size}</span>
                                  </div>
                                  <h4 className="text-[11px] font-black text-slate-800 leading-tight truncate">{prod.name}</h4>
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    <span className="text-[11px] font-black text-rc-red">₹{prod.price}</span>
                                    <span className="text-[8px] text-gray-400 line-through font-medium">₹{Math.round(prod.price * 1.25)}</span>
                                    <span className="text-[7.5px] bg-green-50 text-green-700 px-1 py-0.2 rounded font-extrabold uppercase">Save 20%</span>
                                  </div>
                                </div>
                              </div>

                              {/* Order button or Live Sync Stepper */}
                              {activeZeptoProduct?.id === prod.id && isZeptoSyncing ? (
                                <div className="bg-purple-50/70 p-2.5 rounded-lg border border-purple-100 flex flex-col gap-3 select-none">
                                  <div className="flex justify-between items-center text-[8px] font-black uppercase text-purple-900 tracking-wider">
                                    <span className="flex items-center gap-1">
                                      <span className="w-1 h-1 bg-purple-600 rounded-full animate-ping" />
                                      Syncing to Zepto...
                                    </span>
                                    <span>Step {zeptoSyncStep + 1}/3</span>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                      <div className={cn(
                                        "w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-extrabold shrink-0",
                                        zeptoSyncStep >= 0 ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-400"
                                      )}>
                                        {zeptoSyncStep > 0 ? "✓" : "1"}
                                      </div>
                                      <span className={cn("text-[9px] font-bold", zeptoSyncStep >= 0 ? "text-slate-800" : "text-slate-400")}>
                                        Verifying pet profile
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <div className={cn(
                                        "w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-extrabold shrink-0",
                                        zeptoSyncStep >= 1 ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-400"
                                      )}>
                                        {zeptoSyncStep > 1 ? "✓" : "2"}
                                      </div>
                                      <span className={cn("text-[9px] font-bold", zeptoSyncStep >= 1 ? "text-slate-800" : "text-slate-400")}>
                                        Locking down stock
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <div className={cn(
                                        "w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-extrabold shrink-0",
                                        zeptoSyncStep >= 2 ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"
                                      )}>
                                        {zeptoSyncStep >= 2 ? "✓" : "3"}
                                      </div>
                                      <span className={cn("text-[9px] font-bold", zeptoSyncStep >= 2 ? "text-emerald-700 font-extrabold animate-pulse" : "text-slate-400")}>
                                        {zeptoSyncStep >= 2 ? "Synced! Pay below" : "Routing delivery path"}
                                      </span>
                                    </div>
                                  </div>

                                  {zeptoSyncStep >= 2 && (
                                    <button
                                      onClick={handleCompleteZeptoCheckout}
                                      className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold uppercase tracking-widest py-2 px-3 rounded-lg text-[9px] shadow-sm transition-all flex items-center justify-center gap-1 border-0 cursor-pointer"
                                    >
                                      ⚡ COMPLETE UPI CHECKOUT (₹{prod.price})
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleTriggerZeptoSync(prod)}
                                  className="w-full bg-linear-to-r from-rc-red to-[#be123c] hover:opacity-95 text-white font-extrabold uppercase tracking-widest py-2 px-3 rounded-lg text-[8.5px] shadow-2xs active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer border-0"
                                >
                                  <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                                    <path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2v-8.03c2.09-.13 3.75-1.85 3.75-3.97V22h-2v-7zm8-3h-1v4h1v10h2V6c0-1.66-1.34-3-3-3h-1v3h2z"/>
                                  </svg>
                                  Buy Formulation (Auto-Sync Zepto)
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {msg.isRating && (
                      <RatingSystem vetName={activeVet?.name || "the vet"} onRate={handleRate} />
                    )}
                    {msg.isVetList && (
                      <div className="ml-1 mb-4 max-w-[90%]">
                        {(msg.vets || vets).length > 0 ? (
                          (msg.vets || vets).map((vet: any) => (
                            <VetCard 
                              key={vet.id} 
                              vet={vet} 
                              onSelect={(v) => {
                                addMessage({ text: "Connecting to " + v.name + "...", role: "system" });
                                setActiveVet(v);
                                setTimeout(() => {
                                  addMessage({ 
                                    text: `Hello! I'm ${v.name}. I see you have a ${puppyData.breed} at ${puppyData.ageInWeeks} weeks. How can I help today?\n\n[Our session will be summarized automatically at the end]`,
                                    role: "vet",
                                    senderName: v.name
                                  });
                                  setTimeout(() => generateVetSummary(), 5000);
                                }, 1200);
                              }} 
                              onSchedule={handleOpenScheduler}
                              onLocate={handleLocateVet}
                            />
                          ))
                        ) : (
                          <div className="p-4 bg-gray-100 rounded-xl text-center text-[10px] text-gray-500 font-bold uppercase animate-pulse">
                            Searching for best matches...
                          </div>
                        )}
                      </div>
                    )}
              </motion.div>
            ))}
          </AnimatePresence>

          {!puppyData.onboardingComplete && onboardingIndex !== -1 && onboardingIndex >= 0 && ONBOARDING_STEPS[onboardingIndex].options && (
            <div className="flex flex-col gap-2 mt-2 mb-6 self-start w-full max-w-[85%] ml-1">
              {ONBOARDING_STEPS[onboardingIndex].options?.map((opt, i) => (
                <button
                  key={opt}
                  onClick={() => handleSend(opt)}
                  className="w-full bg-white border border-gray-200 text-[#075E54] text-[11px] font-bold py-2 px-4 rounded-lg shadow-sm hover:bg-gray-50 text-left transition-all active:scale-95"
                >
                  {i + 1}. {opt}
                </button>
              ))}
            </div>
          )}

          {!puppyData.onboardingComplete && onboardingIndex === -1 && (
                <div className="flex flex-col gap-2 mt-4">
                  <button 
                    onClick={() => handleSend("New Puppy Setup")}
                    className="w-full bg-white border border-gray-200 text-[#075E54] text-[11px] font-bold py-2 px-4 rounded-lg shadow-sm hover:bg-gray-50 text-left"
                  >
                    1. New Puppy Setup
                  </button>
                  <button 
                    onClick={() => handleSend("Ask a Question")}
                    className="w-full bg-white border border-gray-200 text-[#075E54] text-[11px] font-bold py-2 px-4 rounded-lg shadow-sm hover:bg-gray-50 text-left"
                  >
                    2. Ask a Question
                  </button>
                  <button 
                    onClick={() => handleSend("VET")}
                    className="w-full bg-white border border-gray-200 text-[#075E54] text-[11px] font-bold py-2 px-4 rounded-lg shadow-sm hover:bg-gray-50 text-left"
                  >
                    3. Connect to a Vet
                  </button>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <ChatInput onSend={handleSend} />

            {/* Time-Slot Picker Modal Sheet */}
            {schedulingVet && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30 flex flex-col justify-end">
                {/* Close backdrop */}
                <div className="flex-1" onClick={() => setSchedulingVet(null)} />
                
                {/* Scrollable Sheet Panel */}
                <motion.div 
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  className="bg-white rounded-t-[28px] p-4 shadow-2xl border-t border-gray-100 flex flex-col max-h-[90%] overflow-y-auto text-[#1F2937]"
                >
                  {/* Handle Drag bar */}
                  <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3 flex-shrink-0" />
                  
                  {/* Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Book Consultation</h4>
                      <h3 className="text-xs font-black text-gray-900 mt-0.5">{schedulingVet.name.includes("Dr. ") ? schedulingVet.name : `Dr. ${schedulingVet.name}`}</h3>
                      <p className="text-[10px] text-gray-500">Canine Specialist • {schedulingVet.distance || "1.2 km"}</p>
                    </div>
                    <button 
                      onClick={() => setSchedulingVet(null)}
                      className="p-1 hover:bg-gray-100 rounded-full text-gray-400 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  
                  {/* Date Picker Slider */}
                  <div className="mb-3">
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Select Date</label>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                      {getUpcomingDays().map((day, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedDayIndex(idx)}
                          className={cn(
                            "flex flex-col items-center justify-center p-1.5 rounded-lg border flex-shrink-0 min-w-[56px] transition-all cursor-pointer",
                            selectedDayIndex === idx 
                              ? "bg-rc-red text-white border-rc-red shadow-sm font-bold" 
                              : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                          )}
                        >
                          <span className="text-[8px] uppercase tracking-tighter opacity-80">{day.dayName}</span>
                          <span className="text-xs font-black mt-0.5">{day.dateStr}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Time Picker Grid */}
                  <div className="mb-3">
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Select Time Slot</label>
                    <div className="grid grid-cols-3 gap-1">
                      {TIME_SLOTS.map((time) => (
                        <button
                          key={time}
                          type="button"
                          onClick={() => setSelectedTimeSlot(time)}
                          className={cn(
                            "py-1 rounded-md border text-[9px] font-bold transition-all cursor-pointer text-center",
                            selectedTimeSlot === time
                              ? "bg-rc-red text-white border-rc-red shadow-inner font-extrabold"
                              : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                          )}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Call Format */}
                  <div className="mb-3">
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Consultation Format</label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedCallType("video")}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg border flex items-center justify-center gap-1.5 text-[9px] font-bold transition-all cursor-pointer",
                          selectedCallType === "video"
                            ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                            : "bg-gray-50 text-gray-650 border-gray-200 hover:bg-gray-100"
                        )}
                      >
                        <Video className="w-3 h-3" /> Video Call
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCallType("voice")}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg border flex items-center justify-center gap-1.5 text-[9px] font-bold transition-all cursor-pointer",
                          selectedCallType === "voice"
                            ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                            : "bg-gray-50 text-gray-655 border-gray-200 hover:bg-gray-100"
                        )}
                      >
                        <Phone className="w-3 h-3" /> Voice Call
                      </button>
                    </div>
                  </div>
                  
                  {/* Symptoms Notes */}
                  <div className="mb-4">
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Reason for Call (Optional)</label>
                    <input
                      type="text"
                      value={consultNotes}
                      onChange={(e) => setConsultNotes(e.target.value)}
                      placeholder="e.g. skin itching, schedule vaccinations..."
                      className="w-full text-[10px] p-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-rc-red/40 focus:border-rc-red/40 text-gray-800"
                    />
                  </div>
                  
                  {/* Book Button */}
                  <button 
                    onClick={handleBookAppointment}
                    className="w-full py-2 bg-rc-red hover:bg-rc-red/90 text-white text-[10px] font-bold rounded-lg tracking-wider uppercase shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    Confirm Booking 🐾
                  </button>
                </motion.div>
              </div>
            )}

            {/* Live Video / Voice Calling Overlay */}
            {activeCallAppointment && (
              <div className="absolute inset-0 bg-gray-950 z-40 flex flex-col text-white">
                {/* Caller Top Bar */}
                <div className="p-3 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent pt-5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-red-400">Live Consultation</span>
                  </div>
                  <span className="font-mono text-[10px] text-white/95 font-bold bg-black/40 px-2 py-0.5 rounded-full border border-white/5">
                    {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, "0")}
                  </span>
                </div>

                {/* Main Video Stage */}
                <div className="flex-1 relative flex flex-col items-center justify-center p-4">
                  {/* Back Video Feed / Profile Vet */}
                  <div className="absolute inset-x-3 inset-y-1 rounded-2xl overflow-hidden bg-slate-900 border border-white/5 flex items-center justify-center">
                    {!isVideoOff ? (
                      <div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1E293B] to-[#0F172A] p-4 text-center">
                        <div className="w-16 h-16 rounded-full bg-rc-red/10 border border-rc-red/30 flex items-center justify-center text-2xl font-black animate-pulse text-rc-red shadow-2xl relative">
                          {activeCallAppointment.vetName.includes("Dr. ") ? activeCallAppointment.vetName.split("Dr. ")[1].charAt(0) : activeCallAppointment.vetName.charAt(0)}
                          <div className="absolute -inset-3 rounded-full border border-rc-red/10 animate-ping" style={{ animationDuration: '3s' }} />
                        </div>
                        
                        <div className="mt-3">
                          <p className="text-xs font-black tracking-tight">{activeCallAppointment.doctorTitle}</p>
                          <p className="text-[9px] text-[#A1A1AA] font-bold uppercase tracking-widest mt-0.5">Royal Canin Vet Specialist</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-[#71717A]">
                        <VideoOff className="w-8 h-8 mb-1.5 text-[#52525B]" />
                        <p className="text-[10px]">Your camera is off</p>
                      </div>
                    )}
                  </div>

                  {/* Pip camera feed of puppy */}
                  <div className="absolute bottom-4 right-6 w-14 h-18 rounded-lg border border-white/10 overflow-hidden bg-slate-800 shadow-xl flex items-center justify-center z-10">
                    <img 
                      src="https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&q=80&w=200" 
                      className="w-full h-full object-cover" 
                      alt="puppy feed"
                    />
                    <div className="absolute bottom-0.5 right-0.5 bg-black/60 text-[7px] px-0.5 rounded font-bold text-white uppercase font-mono">You</div>
                  </div>
                  
                  {/* Subtitles bar */}
                  {callSubtitles && (
                    <div className="absolute bottom-[20%] inset-x-6 text-center bg-black/80 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/5 shadow-xl z-20">
                      <p className="text-[7px] font-bold text-green-400 uppercase tracking-widest mb-0.5 font-mono">Doctor Speaking</p>
                      <p className="text-[10px] text-white leading-snug font-bold">
                        {callSubtitles}
                      </p>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="p-4 bg-gradient-to-t from-black/70 to-transparent flex flex-col gap-2.5 items-center">
                  <div className="flex items-center gap-4 justify-center">
                    <button
                      onClick={() => setIsMuted(prev => !prev)}
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer",
                        isMuted ? "bg-red-500 text-white" : "bg-white/10 hover:bg-white/20 text-white"
                      )}
                    >
                      {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    
                    <button
                      onClick={handleEndCall}
                      className="w-11 h-11 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-lg hover:shadow-red-500/20 active:scale-95 text-white transition-all cursor-pointer"
                    >
                      <Phone className="w-4 h-4 rotate-[135deg] fill-white text-white" />
                    </button>
                    
                    <button
                      onClick={() => setIsVideoOff(prev => !prev)}
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer",
                        isVideoOff ? "bg-red-500 text-white" : "bg-white/10 hover:bg-white/20 text-white"
                      )}
                    >
                      {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[7.5px] text-[#71717A] uppercase tracking-wider font-bold">100% Encrypted Vet Tunnel</p>
                </div>
              </div>
            )}

            {/* INVOICE OVERLAY MODAL */}
            <AnimatePresence>
              {selectedInvoice && (
                <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 overflow-hidden flex flex-col text-[#1F2937]"
                  >
                    {/* Invoice header */}
                    <div className="bg-linear-to-b from-rc-red to-[#be123c] text-white p-4 text-center relative select-none">
                      <button 
                        onClick={() => setSelectedInvoice(null)}
                        className="absolute top-3 right-3 text-white/80 hover:text-white hover:bg-white/10 rounded-full p-1 transition-all cursor-pointer border-0 bg-transparent"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <h3 className="text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1">
                        🐾 Tax Invoice / Receipt
                      </h3>
                      <p className="text-[8px] text-white/70 uppercase tracking-tighter mt-1 font-mono">
                        CareCircle Partnered Quick Commerce Ingress Portal
                      </p>
                    </div>

                    {/* Invoice content */}
                    <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[360px] select-text">
                      <div className="flex justify-between border-b border-dashed border-slate-200 pb-2.5">
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">Invoice Number</p>
                          <p className="font-mono font-black text-slate-800 text-[10px]">{selectedInvoice.invoiceNo}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-slate-400 font-bold uppercase">Order Reference</p>
                          <p className="font-mono text-slate-600 text-[10px]">{selectedInvoice.id}</p>
                        </div>
                      </div>

                      <div className="space-y-1.5 border-b border-slate-100 pb-3">
                        <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                          <span>Description</span>
                          <span>Amount</span>
                        </div>
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 pr-4">
                            <p className="font-extrabold text-slate-800 leading-tight truncate">{selectedInvoice.productName}</p>
                            <p className="text-[8px] text-slate-400 uppercase mt-0.5 font-bold">Size: {selectedInvoice.size || "Standard"}</p>
                          </div>
                          <span className="font-extrabold text-slate-800">₹{(selectedInvoice.price * 0.82).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-500 font-medium pt-1">
                          <span>CGST (@9%)</span>
                          <span>₹{(selectedInvoice.price * 0.09).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-500 font-medium">
                          <span>SGST (@9%)</span>
                          <span>₹{(selectedInvoice.price * 0.09).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-500 font-medium">
                          <span>Delivery Surcharge (Express)</span>
                          <span className="text-emerald-600 uppercase font-black">Free</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-slate-850 font-black text-xs pt-1">
                        <span>Grand Total (Paid)</span>
                        <span className="text-rc-red text-sm font-black">₹{selectedInvoice.price}.00</span>
                      </div>

                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100/80 space-y-1 text-[9px] leading-tight text-slate-500">
                        <p className="font-bold text-slate-700 uppercase tracking-wide text-[7.5px] mb-0.5">Delivery Destination</p>
                        <p><strong>Owner:</strong> {currentUser?.displayName || "CareCircle Verified Owner"}</p>
                        <p><strong>Location:</strong> {puppyData.location || "Mumbai, India"}</p>
                        <p><strong>Breed Age profile:</strong> {puppyData.breed || "Puppy"} ({puppyData.ageInWeeks || "Age-unspecified"} Weeks)</p>
                      </div>

                      <div className="text-[7.5px] text-zinc-400 leading-normal text-center select-none pt-2 border-t border-slate-100">
                        This is an official secure e-commerce execution invoice linked directly with Zepto's live logistics pipeline. Total amount includes applicable taxes.
                      </div>
                    </div>

                    {/* Invoice Footer Actions */}
                    <div className="bg-slate-50 p-3 border-t border-slate-100 flex gap-2 select-none">
                      <button
                        onClick={() => {
                          alert("GST invoice successfully initialized for download/printing! Verified offline copy saved.");
                        }}
                        className="flex-1 py-2 bg-slate-900 border-0 text-white text-[9.5px] tracking-wider uppercase font-extrabold rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" /> Download Receipt
                      </button>
                      <button
                        onClick={() => setSelectedInvoice(null)}
                        className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 text-[9.5px] tracking-wider uppercase font-extrabold rounded-xl transition-all cursor-pointer bg-white"
                      >
                        Close
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* GOOGLE MAPS MOBILE MODAL COMPONENT */}
            <AnimatePresence>
              {isMobileMapOpen && (
                <div className="absolute inset-0 bg-black/65 backdrop-blur-xs z-30 flex flex-col justify-end">
                  {/* Close backdrop */}
                  <div className="absolute inset-0" onClick={() => setIsMobileMapOpen(false)} />
                  
                  {/* Scrollable Sheet Panel */}
                  <motion.div 
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    className="bg-white rounded-t-[28px] p-4 shadow-2xl border-t border-gray-100 flex flex-col h-[75%] overflow-hidden text-[#1F2937] z-40 relative"
                  >
                    {/* Handle Drag bar */}
                    <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3 flex-shrink-0" />
                    
                    {/* Header */}
                    <div className="flex justify-between items-start mb-2 flex-shrink-0">
                      <div>
                        <span className="text-[8px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                          📍 Clinic Locator
                        </span>
                        <h3 className="text-xs font-black text-gray-900 mt-1">
                          {mapFocusedVet ? mapFocusedVet.name : "Select a Clinic"}
                        </h3>
                        <p className="text-[9px] text-gray-400 mt-0.5">
                          {mapFocusedVet ? `${mapFocusedVet.location} • ${mapFocusedVet.distance}` : "Tap any doctor on your list"}
                        </p>
                      </div>
                      <button 
                        onClick={() => setIsMobileMapOpen(false)}
                        className="p-1 hover:bg-gray-100 rounded-full text-gray-400 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Google Map Box */}
                    <div className="flex-1 bg-gray-100 rounded-xl overflow-hidden mb-3 border border-gray-155 relative min-h-[140px]">
                      {renderMobileMapBox()}
                    </div>

                    {/* Footer buttons */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (mapFocusedVet) {
                              addMessage({
                                text: `📞 **DIALING CLINIC VOICE LINE**\nConnecting phone line to **${mapFocusedVet.name}** (*${mapFocusedVet.location}*)...`,
                                role: "system"
                              });
                              setIsMobileMapOpen(false);
                            }
                          }}
                          className="flex-1 py-1.5 bg-slate-850 text-white text-[8.5px] font-black rounded-lg uppercase tracking-wider text-center cursor-pointer hover:bg-slate-750 transition-all font-sans"
                        >
                          Call Clinic
                        </button>
                        <button
                          onClick={() => {
                            if (mapFocusedVet) {
                              addMessage({
                                text: `🚗 **DIRECTIONS STARTED**\n\nStarting navigation route from Mumbai Airport area to **${mapFocusedVet.name}** (*${mapFocusedVet.location}*).\n\n🛣️ Estimated arrival time in 6 mins. Watch your dashboard!`,
                                role: "system"
                              });
                              setIsMobileMapOpen(false);
                            }
                          }}
                          className="flex-1 py-1.5 bg-green-600 text-white text-[8.5px] font-black rounded-lg uppercase tracking-wider text-center cursor-pointer hover:bg-green-700 transition-all font-sans"
                        >
                          Navigate
                        </button>
                      </div>
                      <p className="text-[7.5px] text-gray-400 text-center uppercase tracking-tight font-black">
                        Platform Map v3 • version weekly
                      </p>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Right Column: Context & Output Preview */}
        <aside className="w-80 bg-white border-l border-gray-200 p-6 flex flex-col gap-5 overflow-y-auto">
          {/* Right Aside Premium Segment Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50 select-none gap-0.5">
            <button
              onClick={() => setRightSidebarTab("clinical")}
              className={cn(
                "flex-1 py-1.5 px-1 text-[8.5px] font-black tracking-tighter uppercase rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer",
                rightSidebarTab === "clinical" 
                  ? "bg-white text-rc-red shadow-xs border border-slate-200/20" 
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Layers className="w-3 h-3" /> Clinical
            </button>
            <button
              onClick={() => setRightSidebarTab("registry")}
              className={cn(
                "flex-1 py-1.5 px-1 text-[8.5px] font-black tracking-tighter uppercase rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer",
                rightSidebarTab === "registry" 
                  ? "bg-white text-rc-red shadow-xs border border-slate-200/20" 
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Globe className="w-3 h-3" /> Registry db
            </button>
            <button
              onClick={() => setRightSidebarTab("quickcommerce")}
              className={cn(
                "flex-1 py-1.5 px-0.5 text-[8.5px] font-black tracking-tighter uppercase rounded-lg transition-all flex items-center justify-center gap-0.5 cursor-pointer",
                rightSidebarTab === "quickcommerce" 
                  ? "bg-white text-rc-red shadow-xs border border-slate-200/20" 
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <ShoppingBag className="w-3 h-3" /> Zepto Hub
            </button>
          </div>

          {rightSidebarTab === "clinical" ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-4 tracking-wider">Vet Matching Flow</h3>
                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 min-h-[140px] flex flex-col justify-center">
                  {isLoadingVets ? (
                    <div className="flex flex-col items-center justify-center py-6">
                      <div className="w-8 h-8 border-2 border-rc-red border-t-transparent rounded-full animate-spin mb-3"></div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest animate-pulse">Scanning nearby clinics...</p>
                    </div>
                  ) : vets.length > 0 ? (
                    <div className="space-y-4">
                      {vets.slice(0, 3).map((vet) => (
                        <VetCard 
                          key={vet.id} 
                          vet={vet} 
                          onSelect={(v) => {
                            addMessage({ text: "Connecting to " + v.name + " from sidebar...", role: "system" });
                            setActiveVet(v);
                            setTimeout(() => {
                              addMessage({ 
                                text: `Hi there! I'm ${v.name}. I'm reviewing your ${puppyData.breed || "pet"}'s records in ${v.location}. How can I help?`,
                                role: "vet",
                                senderName: v.name
                              });
                            }, 1000);
                          }} 
                          onSchedule={handleOpenScheduler}
                          onLocate={handleLocateVet}
                        />
                      ))}
                      <p className="text-[9px] text-gray-400 text-center uppercase tracking-tighter">Top matches based on proximity</p>
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <Search className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                      <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tight">Waiting for VET command</p>
                    </div>
                  )}
                </div>
                
                {/* GOOGLE MAPS DESKTOP TRACKER BLOCK */}
                <div className="mt-4">
                  <h4 className="text-[9.5px] font-black text-slate-400 uppercase mb-2 tracking-wide flex items-center gap-1.5 select-none">
                    <MapPin className="w-3.5 h-3.5 text-[#E11D48] animate-pulse" /> Live Clinic Tracker
                  </h4>
                  {renderMapBox()}
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-4 tracking-wider">Scheduled Consultations ({appointments.length})</h3>
                {appointments.length > 0 ? (
                  <div className="space-y-3">
                    {appointments.map((appt) => (
                      <div 
                        key={appt.id} 
                        className="p-3 rounded-xl border border-dashed border-slate-200 bg-white flex flex-col gap-2 relative group"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-bold text-slate-800">{appt.doctorTitle}</p>
                            <p className="text-[9px] text-slate-400 uppercase font-medium">{appt.type === "video" ? "📹 Video Call" : "📞 Voice Call"}</p>
                          </div>
                          <span className={cn(
                            "text-[8px] px-1.5 py-0.5 rounded font-bold uppercase",
                            appt.status === "scheduled" ? "bg-green-50 text-green-700 border border-green-200" :
                            appt.status === "completed" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                            "bg-gray-50 text-gray-400 border border-gray-200"
                          )}>
                            {appt.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-[9px] text-slate-600 font-medium">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span className="truncate">{appt.dateStr}</span>
                        </div>

                        <div className="flex items-center gap-1.5 text-[9px] text-slate-600 font-medium">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{appt.timeStr}</span>
                        </div>

                        {appt.notes && (
                          <p className="text-[9px] bg-slate-50 p-1.5 rounded text-slate-500 italic border border-slate-100 max-h-12 overflow-y-auto">
                            "{appt.notes}"
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-1">
                          {appt.status === "scheduled" && (
                            <>
                              <button
                                onClick={() => handleStartCall(appt)}
                                className="flex-1 py-1 bg-green-600 hover:bg-green-700 text-white font-bold rounded text-[9px] uppercase tracking-tight shadow-sm transition-all text-center flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Phone className="w-2.5 h-2.5 fill-white" /> Start Room
                              </button>
                              <button
                                onClick={() => handleCancelAppointment(appt.id, appt.vetName)}
                                className="p-1 border border-red-200 hover:bg-red-50 text-red-500 rounded transition-all cursor-pointer"
                                title="Cancel Booking"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                          
                          {appt.status === "completed" && (
                            <span className="text-[9px] text-blue-600 font-bold uppercase py-1 flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" /> Consultation Done
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-gray-100 rounded-xl p-4 text-center bg-gray-50/50">
                    <p className="text-[9px] text-gray-300 uppercase font-bold tracking-tight">No active reservations</p>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-4 tracking-wider">Output: Vet-Verified Advice</h3>
                {lastSummary ? (
                  <div className="border-2 border-dashed border-rc-red/20 rounded-xl p-4 bg-red-50/10">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[8px] bg-red-100 text-rc-red px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">Verified Summary</span>
                      <span className="text-[9px] text-gray-400">ID: #RC-9812</span>
                    </div>
                    <p className="text-[10px] font-bold mb-2 italic text-gray-700">"Advice for {puppyData.breed || "puppy"}"</p>
                    <div className="text-[10px] leading-relaxed text-gray-600 line-clamp-6 text-slate-600">
                      {lastSummary}
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between">
                      <button 
                        onClick={() => generateDietPDF(puppyData)}
                        className="text-[9px] font-bold text-blue-600 uppercase tracking-tighter hover:underline cursor-pointer"
                      >
                        SHARE DIET PDF
                      </button>
                      <button 
                        onClick={() => {
                          console.log("[CareCircle] Generating Health Tracker PDF...");
                          try {
                            generateHealthTrackerPDF(puppyData, messages);
                            console.log("[CareCircle] PDF generated successfully.");
                          } catch (err) {
                            console.error("[CareCircle] PDF Generation failed:", err);
                            alert("Could not generate PDF. Check console for details.");
                          }
                        }}
                        className="text-[9px] font-bold text-blue-600 uppercase tracking-tighter hover:underline cursor-pointer"
                      >
                        SAVE HEALTH TRACKER
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-100 rounded-xl p-6 text-center">
                    <p className="text-[10px] text-gray-300 uppercase font-bold italic line-height-tight">No summary generated yet<br />Complete a vet consultation</p>
                  </div>
                )}
              </div>

              <div className="mt-auto p-4 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-[10px] text-gray-400 leading-relaxed uppercase tracking-tighter font-semibold">
                  Dev Note: Preference set to <span className="text-rc-red font-bold">{puppyData.preferenceLevel?.toUpperCase() || "MINIMAL"}</span>. No marketing broadcasts permitted by system architecture. Alerts filtered by breed-age matrix.
                </p>
              </div>
            </div>
          ) : rightSidebarTab === "registry" ? (
            <div className="space-y-5">
              {/* Connection Status Header */}
              <div>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-3 tracking-wider">Database Connection</h3>
                {currentUser ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex flex-col gap-1.5 shadow-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-tight flex items-center gap-1">
                        <ShieldCheck className="w-2.5 h-2.5" /> Connected
                      </span>
                      <button 
                        onClick={() => signOut(auth)}
                        className="text-[8.5px] font-extrabold text-[#E11D48] hover:underline uppercase flex items-center gap-0.5 cursor-pointer border-0 bg-transparent"
                      >
                        <LogOut className="w-2.5 h-2.5" /> Sign Out
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="w-6 h-6 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center overflow-hidden">
                        {currentUser.photoURL ? (
                          <img src={currentUser.photoURL} alt="pfp" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User className="w-3 h-3 text-slate-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-extrabold text-slate-850 truncate leading-none">{currentUser.displayName || "CareCircle Member"}</p>
                        <p className="text-[8px] text-slate-450 truncate mt-0.5">{currentUser.email}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 text-center">
                    <p className="text-[9px] text-gray-500 font-bold leading-relaxed mb-2.5 uppercase tracking-wide">
                      🔒 Publish Profiles to Live Database
                    </p>
                    <button
                      onClick={async () => {
                        try {
                          const provider = new GoogleAuthProvider();
                          await signInWithPopup(auth, provider);
                        } catch (err) {
                          console.error("Sign in failed:", err);
                        }
                      }}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-extrabold rounded-lg text-[9px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm border-0"
                    >
                      <img src="https://www.google.com/favicon.ico" className="w-3 h-3" alt="google" />
                      Google Connect
                    </button>
                  </div>
                )}
              </div>

              {/* CLUSTERED TREE VIEW */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5 select-none font-black">
                    📂 Real-time Clustered Registry ({[...DEFAULT_REGISTRATIONS, ...dbRegistrations].length})
                  </h3>
                  <button
                    onClick={fetchRegistrations}
                    className="p-1 hover:bg-gray-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors cursor-pointer border-0 bg-transparent"
                    title="Refresh database records"
                    disabled={isLoadingRegistry}
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", isLoadingRegistry && "animate-spin")} />
                  </button>
                </div>

                <div className="space-y-2 select-none">
                  {Object.entries(getGroupedRegistrations()).map(([city, petTypes]: any) => {
                    const isCityExpanded = expandedCities[city];
                    const totalInCity = getCityCount(petTypes);

                    return (
                      <div key={city} className="border border-slate-100 rounded-xl bg-slate-50/20 overflow-hidden">
                        {/* City Row */}
                        <div
                          onClick={() => setExpandedCities(prev => ({ ...prev, [city]: !prev[city] }))}
                          className="p-2.5 bg-slate-50 border-b border-slate-100 flex justify-between items-center cursor-pointer hover:bg-slate-100/60 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-rc-red animate-pulse" />
                            <span className="text-[10.5px] font-black text-slate-800 uppercase tracking-tight">{city}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[8px] bg-red-100 text-rc-red px-1.5 py-0.5 rounded-full font-bold">{totalInCity}</span>
                            {isCityExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                          </div>
                        </div>

                        {isCityExpanded && (
                          <div className="p-1.5 bg-white space-y-1.5 pl-3 border-l-2 border-rc-red/20">
                            {Object.entries(petTypes).map(([petType, breeds]: any) => {
                              const petKey = `${city}-${petType}`;
                              const isPetExpanded = expandedPetTypes[petKey];
                              const totalInPet = getPetCount(breeds);

                              return (
                                <div key={petType} className="rounded-lg bg-slate-50/30 border border-slate-100 overflow-hidden">
                                  {/* Pet Type Row */}
                                  <div
                                    onClick={() => setExpandedPetTypes(prev => ({ ...prev, [petKey]: !prev[petKey] }))}
                                    className="p-1.5 bg-slate-50/50 flex justify-between items-center cursor-pointer hover:bg-slate-100/50 transition-colors"
                                  >
                                    <div className="flex items-center gap-1 text-xs">
                                      {petType === "Dog" ? "🐶" : "🐱"}
                                      <span className="text-[9px] font-bold text-slate-700 uppercase tracking-wide">{petType}s</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[7.5px] text-gray-400 font-bold">({totalInPet})</span>
                                      {isPetExpanded ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                                    </div>
                                  </div>

                                  {isPetExpanded && (
                                    <div className="p-1 pl-3 space-y-1 bg-white border-l border-slate-100">
                                      {Object.entries(breeds).map(([breed, ages]: any) => {
                                        const breedKey = `${city}-${petType}-${breed}`;
                                        const isBreedExpanded = expandedBreeds[breedKey];
                                        const totalInBreed = getBreedCount(ages);

                                        return (
                                          <div key={breed} className="border-b border-slate-50 last:border-0 pb-1">
                                            {/* Breed Row */}
                                            <div
                                              onClick={() => setExpandedBreeds(prev => ({ ...prev, [breedKey]: !prev[breedKey] }))}
                                              className="flex justify-between items-center py-1 cursor-pointer hover:text-rc-red transition-all"
                                            >
                                              <span className="text-[9px] font-semibold text-slate-600">🐾 {breed}</span>
                                              <div className="flex items-center gap-1">
                                                <span className="text-[7px] text-gray-400 font-bold">({totalInBreed})</span>
                                                {isBreedExpanded ? <ChevronDown className="w-2.5 h-2.5 text-slate-300" /> : <ChevronRight className="w-2.5 h-2.5 text-slate-300" />}
                                              </div>
                                            </div>

                                            {isBreedExpanded && (
                                              <div className="pl-3 space-y-1.5 mt-0.5">
                                                {Object.entries(ages).map(([age, members]: any) => {
                                                  const ageKey = `${city}-${petType}-${breed}-${age}`;
                                                  const isAgeExpanded = expandedAges[ageKey] ?? true;

                                                  return (
                                                    <div key={age} className="bg-slate-50/20 p-1 rounded border border-slate-100/30">
                                                      {/* Age Row */}
                                                      <div
                                                        onClick={() => setExpandedAges(prev => ({ ...prev, [ageKey]: isAgeExpanded ? false : true }))}
                                                        className="flex justify-between items-center cursor-pointer py-0.5 hover:text-slate-800 transition-colors"
                                                      >
                                                        <span className="text-[8px] font-black text-slate-400 uppercase">🍼 {age}</span>
                                                        {isAgeExpanded ? <ChevronDown className="w-2 h-2 text-slate-300" /> : <ChevronRight className="w-2 h-2 text-slate-300" />}
                                                      </div>

                                                      {isAgeExpanded && (
                                                        <div className="mt-1 space-y-1 pl-1">
                                                          {members.map((member: any) => (
                                                            <div
                                                              key={member.id}
                                                              className="p-1.5 bg-white border border-slate-100 rounded-lg shadow-2xs flex flex-col gap-0.5 hover:border-rc-red/20 transition-all"
                                                            >
                                                              <div className="flex justify-between items-start">
                                                                <span className="text-[9px] font-black text-slate-800 leading-tight truncate max-w-[120px]">{member.ownerName}</span>
                                                                <span className={cn(
                                                                  "text-[6px] px-1 rounded-sm uppercase font-black tracking-wider leading-none py-0.5",
                                                                  member.preferenceLevel === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                                                                  member.preferenceLevel === "Guided" ? "bg-cyan-50 text-cyan-700 border border-cyan-100" :
                                                                  "bg-slate-50 text-slate-500 border border-slate-100"
                                                                )}>
                                                                  {member.preferenceLevel}
                                                                </span>
                                                              </div>
                                                              <div className="flex items-center justify-between text-[7px] text-gray-400 leading-none mt-0.5">
                                                                <span>📅 {new Date(member.createdAt || Date.now()).toLocaleDateString("en-IN", {month: "short", day: "numeric"})}</span>
                                                                <span className="opacity-70">ID: #{member.id.substring(0, 6)}</span>
                                                              </div>
                                                            </div>
                                                          ))}
                                                        </div>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 flex-1 flex flex-col min-h-0 select-none">
              {/* ZEPTO QUICK COM PANEL */}
              <div className="p-4 rounded-xl border border-purple-100 bg-purple-50/40 text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-1">
                  <span className="text-[7px] bg-purple-600 text-white px-1 py-0.5 rounded-full font-black animate-pulse">LIVE LINK</span>
                </div>
                <h3 className="text-xs font-black text-purple-900 uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
                  🛵 Zepto Auto-Sync Port
                </h3>
                <p className="text-[9px] text-purple-600 leading-snug font-medium">
                  Direct vet prescription checkout tunnel. No external platform needed.
                </p>
              </div>

              {/* BACKGROUND SYNC STATUS BLOCK */}
              {activeZeptoProduct && isZeptoSyncing && (
                <div className="border border-indigo-100 rounded-xl p-4 bg-white shadow-xs space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[8px] uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-black animate-pulse">
                      Syncing with Zepto...
                    </span>
                    <span className="text-[9px] font-bold text-gray-400">Step {zeptoSyncStep + 1}/3</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <div className={cn(
                        "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                        zeptoSyncStep >= 0 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
                      )}>
                        {zeptoSyncStep > 0 ? "✓" : "1"}
                      </div>
                      <span className={cn("text-[10px] font-bold", zeptoSyncStep >= 0 ? "text-slate-800" : "text-slate-400")}>
                        Reading clinic recommendations
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <div className={cn(
                        "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                        zeptoSyncStep >= 1 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
                      )}>
                        {zeptoSyncStep > 1 ? "✓" : "2"}
                      </div>
                      <span className={cn("text-[10px] font-bold", zeptoSyncStep >= 1 ? "text-slate-800" : "text-slate-400")}>
                        Authenticating Zepto Cart SKU
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <div className={cn(
                        "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                        zeptoSyncStep >= 2 ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"
                      )}>
                        3
                      </div>
                      <span className={cn("text-[10px] font-bold", zeptoSyncStep >= 2 ? "text-slate-800 animate-pulse" : "text-slate-400")}>
                        {zeptoSyncStep >= 2 ? "Synced! Complete delivery below" : "Updating background logs"}
                      </span>
                    </div>
                  </div>

                  {zeptoSyncStep >= 2 && (
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <p className="text-[9px] text-slate-500 font-medium italic">
                        The vet-approved item has been staged on your backend dashboard.
                      </p>
                      <button
                        onClick={handleCompleteZeptoCheckout}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl text-[9.5px] font-black uppercase tracking-wider transition-all shadow-sm flex items-center justify-center gap-1 border-0 cursor-pointer"
                      >
                        ⚡ Complete UPI Checkout (₹{activeZeptoProduct.price})
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ACTIVE RUNNING DELIVERIES */}
              <div className="space-y-2 flex-1 overflow-y-auto pr-0.5 min-h-[120px]">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Order History & Live Tracking
                </h4>

                {orders.length === 0 ? (
                  <div className="border border-dashed border-gray-100 rounded-xl p-6 text-center bg-gray-50/35">
                    <p className="text-[9.5px] text-gray-300 font-bold uppercase italic tracking-tight">
                      No orders placed yet.<br />Trigger a "Buy Product" flow.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders.map((ord) => (
                      <div 
                        key={ord.id} 
                        className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-2xs flex flex-col gap-2 relative animate-fade-in"
                      >
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-extrabold text-slate-850 truncate leading-snug">{ord.productName}</p>
                            <p className="text-[7.5px] text-slate-400 uppercase font-bold tracking-tight">
                              ID: {ord.id} • {new Date(ord.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <span className={cn(
                            "text-[7px] px-1.5 py-0.5 rounded-sm font-black uppercase tracking-wide border font-mono shrink-0",
                            ord.status === "Packing" ? "bg-amber-50 text-amber-600 border-amber-100" :
                            ord.status === "Rider Dispatched" ? "bg-indigo-50 text-indigo-600 border-indigo-150" :
                            "bg-green-50 text-green-700 border-green-200"
                          )}>
                            {ord.status}
                          </span>
                        </div>

                        {/* Visual tracking timeline */}
                        {(ord.status === "Packing" || ord.status === "Rider Dispatched") && (
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 space-y-1.5">
                            <div className="flex items-center justify-between text-[7px] text-slate-400 font-black tracking-tighter">
                              <span className={ord.status === "Packing" ? "text-amber-600 font-bold" : ""}>PACKING 🎒</span>
                              <span>→</span>
                              <span className={ord.status === "Rider Dispatched" ? "text-indigo-600 font-bold" : ""}>RIDER DISPATCHED 🛵</span>
                              <span>→</span>
                              <span>DELIVERED 📦</span>
                            </div>
                            <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full bg-linear-to-r from-amber-500 to-indigo-600 transition-all duration-1000",
                                  ord.status === "Packing" ? "w-1/3" : "w-2/3"
                                )}
                              />
                            </div>
                            <p className="text-[8px] text-slate-500 text-center font-bold">
                              {ord.status === "Packing" ? "📍 Warehouse is packaging your prescription diet" : "🛵 Rider in transit. ETA: Under 5 mins"}
                            </p>
                          </div>
                        )}

                        <div className="flex justify-between items-center mt-1 border-t border-slate-100 pt-2 shrink-0">
                          <span className="text-xs font-black text-slate-800">₹{ord.price}</span>
                          <button
                            onClick={() => setSelectedInvoice(ord)}
                            className="text-[8px] text-rc-red hover:underline uppercase font-extrabold flex items-center gap-0.5 cursor-pointer bg-transparent border-0"
                          >
                            <FileText className="w-3 h-3" /> View Invoice
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </main>

      {/* Footer Bar */}
      <footer className="bg-[#2D3436] text-white px-8 py-2 flex justify-between items-center text-[10px] uppercase font-bold tracking-widest z-20">
        <div className="flex gap-4 opacity-50">
          <span>v1.0.4-PROTOTYPE</span>
          <span>NODE.JS 20.x</span>
          <span>FIREBASE / CLOUD RUN</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span> Meta API Connected</span>
          <span className="opacity-30">© 2026 Royal Canin Engineering</span>
        </div>
      </footer>
    </div>
  );
}

