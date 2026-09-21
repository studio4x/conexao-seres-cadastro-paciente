import {
  formatCpf,
  formatCurrency,
  formatWhatsapp,
  jornadaBillingTypeLabel,
  jornadaPaymentStatusLabel,
} from "@/lib/jornada-yoga";

export type JourneyRegistrationPdfRow = {
  paymentId: string;
  name: string;
  email: string;
  cpf: string;
  whatsapp: string;
  status: string;
  paid: boolean;
  billingType: string;
  value: number;
  dateCreated: string;
  paymentDate: string;
};

type PdfOptions = {
  filterLabel: string;
  query: string;
};

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return !value ? "-" : match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function generatedAt() {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());
}

function fileDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function exportJourneyRegistrationsPdf(
  rows: JourneyRegistrationPdfRow[],
  options: PdfOptions,
) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  doc.setProperties({
    title: "Inscritos - Jornada de Expansao Mental e Corporal",
    subject: "Lista de inscritos da Jornada da Conexao Seres",
    author: "Conexao Seres",
    creator: "Conexao Seres",
  });

  const paidRows = rows.filter((row) => row.paid);
  const paidAmount = paidRows.reduce((sum, row) => sum + row.value, 0);
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(0, 80, 0);
  doc.rect(0, 0, pageWidth, 7, "F");

  doc.setTextColor(0, 80, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Conexao Seres", 12, 18);

  doc.setTextColor(51, 51, 51);
  doc.setFontSize(13);
  doc.text("Jornada de Expansao Mental e Corporal - Lista de inscritos", 12, 26);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 110, 100);
  doc.text(`Gerado em ${generatedAt()}`, 12, 32);

  const searchText = options.query.trim();
  const context = searchText
    ? `Filtro: ${options.filterLabel} | Busca: ${searchText}`
    : `Filtro: ${options.filterLabel}`;
  doc.text(context, 12, 37);

  const summary = [
    `Exportados: ${rows.length}`,
    `Pagos: ${paidRows.length}`,
    `Nao pagos: ${rows.length - paidRows.length}`,
    `Recebido: ${formatCurrency(paidAmount)}`,
  ];
  doc.setTextColor(49, 95, 49);
  doc.setFont("helvetica", "bold");
  doc.text(summary.join("     "), 12, 43);

  autoTable(doc, {
    startY: 49,
    margin: { left: 10, right: 10, bottom: 14 },
    head: [[
      "Nome",
      "CPF",
      "E-mail",
      "WhatsApp",
      "Inscricao",
      "Pagamento",
      "Status",
      "Valor",
    ]],
    body: rows.map((row) => [
      row.name || "-",
      row.cpf ? formatCpf(row.cpf) : "-",
      row.email || "-",
      row.whatsapp ? formatWhatsapp(row.whatsapp) : "-",
      formatDate(row.dateCreated),
      `${jornadaBillingTypeLabel(row.billingType)}\n${
        row.paymentDate ? formatDate(row.paymentDate) : "Ainda nao pago"
      }`,
      `${row.paid ? "Paga" : "Nao paga"}\n${jornadaPaymentStatusLabel(row.status)}`,
      formatCurrency(row.value),
    ]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.3,
      textColor: [51, 51, 51],
      cellPadding: 1.8,
      lineColor: [218, 224, 216],
      lineWidth: 0.15,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [0, 80, 0],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "left",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 247],
    },
    columnStyles: {
      0: { cellWidth: 39 },
      1: { cellWidth: 25 },
      2: { cellWidth: 48 },
      3: { cellWidth: 31 },
      4: { cellWidth: 23 },
      5: { cellWidth: 38 },
      6: { cellWidth: 34 },
      7: { cellWidth: 25, halign: "right" },
    },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 6) {
        const row = rows[data.row.index];
        if (row?.paid) {
          data.cell.styles.textColor = [34, 110, 53];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setDrawColor(225, 229, 223);
    doc.line(10, pageHeight - 9, pageWidth - 10, pageHeight - 9);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 128, 118);
    doc.text(
      "Conexao Seres - Jornada de Expansao Mental e Corporal",
      10,
      pageHeight - 5,
    );
    doc.text(
      `Pagina ${page} de ${pageCount}`,
      pageWidth - 10,
      pageHeight - 5,
      { align: "right" },
    );
  }

  doc.save(`inscritos-jornada-yoga-${fileDate()}.pdf`);
}
