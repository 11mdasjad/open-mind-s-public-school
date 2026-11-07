import ExcelJS from "exceljs";
export async function downloadExcel(rows: Record<string, any>[], name: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Open Mind's Public School";
  const sheet = workbook.addWorksheet("Records");
  const columns = [...new Set(rows.flatMap(Object.keys))].filter(
    (k) => !["passwordHash", "userId", "parentId", "path"].includes(k),
  );
  sheet.columns = columns.map((key) => ({ header: key, key, width: 24 }));
  rows.forEach((row) =>
    sheet.addRow(
      Object.fromEntries(
        columns.map((key) => [
          key,
          typeof row[key] === "object" ? JSON.stringify(row[key]) : row[key],
        ]),
      ),
    ),
  );
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF344332" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(columns.length, 1) },
  };
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `open-mind-${name}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
export async function readExcel(file: File) {
  if (file.size > 2 * 1024 * 1024)
    throw new Error("Use an Excel file smaller than 2 MB.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("The workbook has no worksheet.");
  if (sheet.rowCount > 501) throw new Error("Import up to 500 rows at a time.");
  const headers: string[] = [];
  sheet
    .getRow(1)
    .eachCell((c, i) => (headers[i] = String(c.value || "").trim()));
  const rows: Record<string, any>[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const data: Record<string, any> = {};
    row.eachCell((cell, col) => {
      if (!headers[col]) return;
      const v = cell.value;
      data[headers[col]] =
        v instanceof Date
          ? v.toISOString().slice(0, 10)
          : typeof v === "object"
            ? v && "text" in v
              ? v.text
              : cell.text
            : v;
    });
    if (Object.keys(data).length) rows.push(data);
  });
  return rows;
}
