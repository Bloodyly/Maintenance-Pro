import fs from "fs";
import path from "path";

// Helper regex functions mimicking Python's re.search / re.findall
function extractTagContent(xml: string, tag: string): string {
  const pattern = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(pattern);
  return match ? match[1].trim() : "";
}

function extractTagsContent(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  const results: string[] = [];
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function getTagValue(xml: string, tag: string, defaultValue = ""): string {
  const closingPattern = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(closingPattern);
  if (match) return match[1].trim();
  const selfClosingPattern = new RegExp(`<${tag}(?:\\s+[^>]*)?\\/>`, "i");
  if (selfClosingPattern.test(xml)) return "";
  return defaultValue;
}

function buildTaifunAddress(xml: string): string {
  const mt3 = getTagValue(xml, "MtName3");
  const mt2 = getTagValue(xml, "MtName2");
  const mt1 = getTagValue(xml, "MtName1");
  const strVal = getTagValue(xml, "Strasse") || getTagValue(xml, "Straße");
  const plz = getTagValue(xml, "Plz") || getTagValue(xml, "PLZ");
  const ort = getTagValue(xml, "Ort");
  
  const parts: string[] = [];
  if (mt3) parts.push(mt3);
  if (mt2) parts.push(mt2);
  if (mt1) parts.push(mt1);
  if (strVal) parts.push(strVal);
  
  const city = [plz, ort].filter(Boolean).join(" ");
  if (city) parts.push(city);
  
  return parts.length ? parts.join(", ") : "";
}

function getCleanType(rawName: string): string {
  const cleaned = rawName.replace(/[\[\]]/g, "").trim();
  if (/bma/i.test(cleaned)) return "BMA";
  if (/ema/i.test(cleaned)) return "EMA";
  if (/ela/i.test(cleaned)) return "ELA";
  if (/lichtruf|ruf/i.test(cleaned)) return "Lichtruf";
  if (/sla/i.test(cleaned)) return "SLA";
  return cleaned ? cleaned.toUpperCase() : "BMA";
}

function matchDetectorType(infoStr: string, nameStr: string, availableDetectors: string[]): string {
  const combined = (infoStr + " " + nameStr).toLowerCase();
  for (const det of availableDetectors) {
    if (det === "-" || det === "Normal") continue;
    if (combined.includes(det.toLowerCase())) return det;
  }
  if (combined.includes("zwischendecke") || combined.includes("zd")) return "ZD";
  if (combined.includes("ansaug") || combined.includes("ras")) return "RAS";
  if (combined.includes("linear") || combined.includes("fireray")) return "LINEAR";
  if (combined.includes("differenz") || combined.includes("tdiff")) return "TDIFF";
  if (combined.includes("maximal") || combined.includes("tmax")) return "TMAX";
  if (combined.includes("bewegung") || combined.includes("bwm")) return "BWM";
  if (combined.includes("riegel") || combined.includes("rsk")) return "RSK";
  if (combined.includes("glas") || combined.includes("gb")) return "Glasbruch";
  return availableDetectors[1] || "Normal";
}

// Load her actual XML from index.html metadata or prompt
const promptXmlPath = "/samba_shares/test_taifun.xml"; // We can write her XML to this file

// Let's write her XML first in the caller or read it if we save it.
// Let's read the first few blocks or the whole prompt to find the XML content.
// Since we have the XML directly in her prompt, we can write a test with it.
