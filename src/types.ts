export interface SubSystem {
  id: string;
  name: string;
  rows: Array<{
    groupId: string;
    groupName: string;
    groupType?: string;
    cells: Array<{
      slotKey: string;
      detectorType: string;
      value: string;
    }>;
  }>;
  hardwareRows?: Array<Record<string, string>>;
}

export interface ProtocolItem {
  id: string;
  name: string;
  address: string;
  contractNumber: string;
  interval: "Jährlich" | "Halbjährlich" | "Vierteljährlich";
  systemType: string;
  status: "ready_to_download" | "downloaded" | "upload_pending" | "synchronized";
  isArchived?: boolean;
  columns: string[];
  applicableValues: string[];
  detectorTypes: string[];
  lastEditedBy?: string;
  lastEditedAt?: string;
  subSystems?: SubSystem[];
  rows: Array<{
    groupId: string;
    groupName: string;
    groupType?: string;
    cells: Array<{
      slotKey: string;
      detectorType: string;
      value: string;
    }>;
  }>;
}

export interface PdfFormField {
  id: string;
  name: string;
  type: "text" | "number" | "checkbox" | "signature" | "zeichenfeld" | "unterschriftfeld" | "zahlen";
  x: number; // percentage, e.g. 15
  y: number; // percentage, e.g. 30
  w: number; // percentage, e.g. 12
  h: number; // percentage, e.g. 4
  placeholder?: string;
  value?: string;
}

export interface PdfTemplate {
  id: string;
  name: string;
  systemType: string; // 'BMA', 'EMA', 'ELA' or 'BLANKO'
  pdfFilename: string;
  fields: PdfFormField[];
}

export interface PdfInstance {
  id: string;
  templateId: string;
  templateName: string;
  systemType: string;
  contractNumber?: string;
  objectName?: string;
  status: "pending" | "filled" | "synced";
  filledValues: Record<string, string>; // fieldId -> value
  signatureData?: string; // base64 drawing
  technicianName?: string;
  lastEditedAt?: string;
  createdAt?: string;
  assignedContractId?: string; // link to existing ProtocolItem (contract) if applicable
  fields: PdfFormField[];
}
