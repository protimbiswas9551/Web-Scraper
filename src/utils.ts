export function convertJsonToCsv(data: any[]): string {
  if (!data || data.length === 0) return "";
  
  // Dynamic extraction of all unique keys across rows
  const keys = Array.from(
    new Set(data.flatMap((item) => Object.keys(item)))
  );
  
  // Generate CSV Header columns
  const header = keys.map(k => `"${String(k).replace(/"/g, '""')}"`).join(",");
  
  // Map row value fields while escaping special characters and newlines
  const rows = data.map((item) => {
    return keys.map((key) => {
      const val = item[key];
      if (val === undefined || val === null) return '""';
      return `"${String(val).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    }).join(",");
  });
  
  return [header, ...rows].join("\n");
}

export function downloadFile(content: string, filename: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (err) {
    return isoString;
  }
}
