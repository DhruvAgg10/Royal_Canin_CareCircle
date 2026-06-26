import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const generateDietPDF = (puppyData: any) => {
  const doc = new jsPDF();
  
  // Header
  doc.setFillColor(226, 0, 26); // RC Red
  doc.rect(0, 0, 210, 40, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text("Royal Canin CareCircle", 20, 25);
  doc.setFontSize(10);
  doc.text("Tailored Nutrition Plan", 20, 32);

  // Body
  doc.setTextColor(45, 52, 54);
  doc.setFontSize(14);
  doc.text(`Diet Plan for: ${puppyData.breed || "Your Puppy"}`, 20, 55);
  doc.setFontSize(10);
  doc.text(`Age: ${puppyData.ageInWeeks || 0} weeks`, 20, 62);
  doc.text(`Location: ${puppyData.location || "Not specified"}`, 20, 67);

  // Table
  const tableData = [
    ["Meal Time", "Portion Size", "Product Recommended"],
    ["Morning (8 AM)", "65g", "RC Puppy Dry Food"],
    ["Noon (1 PM)", "65g", "RC Puppy Dry Food"],
    ["Evening (7 PM)", "65g", "RC Puppy Wet + Dry Mix"]
  ];

  autoTable(doc, {
    startY: 80,
    head: [tableData[0]],
    body: tableData.slice(1),
    headStyles: { fillColor: [226, 0, 26] },
    margin: { left: 20, right: 20 }
  });

  doc.setFontSize(9);
  const finalY = (doc as any).lastAutoTable?.finalY || 150;
  doc.text("Note: Always ensure fresh water is available. Consult a vet for specific medical diets.", 20, finalY + 20);
  
  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated on ${new Date().toLocaleDateString()} | ID: #RC-${Math.floor(Math.random()*10000)}`, 20, 285);

  doc.save(`${puppyData.breed || 'Puppy'}_Diet_Plan.pdf`);
};

export const generateHealthTrackerPDF = (puppyData: any, messages: any[]) => {
  const doc = new jsPDF();
  
  // Header
  doc.setFillColor(45, 52, 54); // Slate grey
  doc.rect(0, 0, 210, 40, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text("Royal Canin CareCircle", 20, 25);
  doc.setFontSize(10);
  doc.text("Puppy Health & Activity Tracker", 20, 32);

  // Body
  doc.setTextColor(45, 52, 54);
  doc.setFontSize(14);
  doc.text(`Medical History Tracker: ${puppyData.breed || "Your Puppy"}`, 20, 55);
  
  // Filter for important system messages or vet summaries
  const summaries = messages
    .filter(m => m.text.includes("📋") || m.text.includes("🚨"))
    .map(m => [
      m.timestamp instanceof Date ? m.timestamp.toLocaleDateString() : new Date(m.timestamp).toLocaleDateString(), 
      m.text.substring(0, 60).replace(/\n/g, ' ') + "..."
    ]);

  autoTable(doc, {
    startY: 70,
    head: [["Date", "Event/Advice"]],
    body: summaries.length > 0 ? summaries : [["N/A", "No consultations yet"]],
    headStyles: { fillColor: [45, 52, 54] },
    margin: { left: 20, right: 20 },
    styles: { fontSize: 8 }
  });

  doc.save(`${puppyData.breed || 'Puppy'}_Health_Tracker.pdf`);
};
