---
id: cobros-seguimiento
name: Carta de Seguimiento de Cobro
matter_types: [all]
document_types: [carta-cobro, recordatorio-cobro, gestion-cobranza]
output: docx
priority: 45
---

# Cuándo usar este skill

Cuando el socio pide redactar un correo o carta para recordarle a un cliente que tiene factura(s) pendiente(s) de pago. El **tono varía según los días de mora**:

- **0-30 días**: cordial, asume olvido. Pregunta si hay algún problema con la factura.
- **31-60 días**: firme pero respetuosa. Recuerda los términos pactados.
- **61-90 días**: formal y precisa. Anuncia próximas acciones (suspensión de servicios, escalamiento legal).
- **>90 días**: enérgica. Anuncia intención de transferir el asunto al área de cobros legales si no hay respuesta en plazo definido.

# Verificación PREVIA

Antes de redactar, verificá con `read_document` o con el contexto del expediente:
- Número de factura, fecha de emisión, fecha de vencimiento.
- Monto exacto adeudado (con ITBIS si aplica).
- Si hay pagos parciales, restarlos del balance.
- Días reales de mora.

NUNCA inventes cifras ni días. Si no podés precisarlos, marcalos como `[DATO PENDIENTE]`.

# Estructura

1. **Saludo**: "**Estimado/Estimada [Sr./Sra.] [Apellido]**:" en negrita.

2. **Apertura** (1 párrafo):
   - 0-30 días: "Esperamos que se encuentre bien. Le escribimos para llamar su atención sobre la factura No. [N], emitida el [fecha] por concepto de [servicio], la cual presenta un saldo pendiente de [monto en letras y números]."
   - 31-60 días: "Le escribimos para dar seguimiento al cobro de la factura No. [N], emitida el [fecha], la cual a la fecha presenta [X] días de mora."
   - >60 días: "Le escribimos con preocupación para abordar la situación de la factura No. [N], emitida el [fecha], la cual a la fecha presenta [X] días de mora y un saldo de [monto]."

3. **Detalle** (cuadro o lista):
   - Factura No.
   - Fecha de emisión.
   - Fecha de vencimiento.
   - Monto original.
   - Pagos parciales aplicados (si los hay).
   - Saldo actual.
   - Días de mora.

4. **Solicitud**:
   - 0-30 días: "Le agradeceríamos confirmar el estado del pago a su mayor conveniencia. Si la factura ya fue procesada, le rogamos enviarnos copia del comprobante para conciliar."
   - 31-60 días: "Solicitamos respetuosamente proceder al pago del saldo pendiente en un plazo no mayor de [N] días, o bien comunicarnos para acordar un plan de pagos."
   - >60 días: "Solicitamos formalmente proceder al pago del saldo pendiente en un plazo improrrogable de [N] días. De no recibir respuesta, nos veremos en la necesidad de [escalar la gestión al área de cobros legales / suspender los servicios profesionales]."

5. **Disposición**:
   "Permanecemos a su disposición para aclarar cualquier consulta. Cualquier pago realizado debe ser referenciado con el número de factura para su correcta aplicación."

6. **Cuenta bancaria** (si está cargada en el expediente):
   - Banco, beneficiario, número de cuenta, tipo, RNC del beneficiario.

7. **Despedida formal larga** (todas las cartas LDP):
   "Sin otro particular, se despide muy atentamente,"

8. **Firma del socio**:
   **[Nombre del Socio]**
   Socio
   LDP Legal Advisors

# Reglas de contenido

- NUNCA amenazar con acciones que no se vayan a tomar (deber de buena fe).
- NUNCA tutear al cliente, aún si la relación es cercana.
- Cifras en letras primero y números entre paréntesis. ITBIS desglosado si aplica.
- Si el cliente es persona jurídica, dirigir al gerente/representante con su nombre completo + cargo.

# Formato de salida

Si es **correo electrónico**: HTML simple, sin floreos. Asunto: "Seguimiento de factura No. [N] — LDP Legal Advisors".

Si es **carta formal**: aplicar `ldp-base` + `ldp-cartas` (Charter Roman 11pt, justify, márgenes 1.00"/1.25", header LDP). Imprimir y enviar por correo certificado en casos >60 días.
