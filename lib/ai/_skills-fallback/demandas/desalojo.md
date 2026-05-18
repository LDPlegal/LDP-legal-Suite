---
id: demandas-desalojo
name: Demanda en Desalojo por Falta de Pago
matter_types: [civil, real_estate, litigation]
document_types: [demanda-desalojo, demanda-desahucio]
output: docx
priority: 60
---

# Marco legal vigente

- **Ley 85-25 sobre Alquileres de Bienes Inmuebles y Desahucios** (G.O. 11211 del 15 de agosto de 2025). Rige las acciones de desalojo por falta de pago, expiración del término, o cambio de destino del inmueble.
- **Ley 821 de Organización Judicial** y Código de Procedimiento Civil dominicano.
- Jurisprudencia: SCJ ha confirmado que la falta de pago es causa autónoma de desahucio (incluso sin intimación previa cuando el contrato lo dispensa).

# Tribunal competente

- **Juzgado de Paz** del lugar donde se encuentra el inmueble cuando el alquiler mensual no excede los topes que fija la ley orgánica (verificar el tope vigente al redactar).
- **Cámara Civil y Comercial del Juzgado de Primera Instancia** cuando excede el tope.
- Si el caso es de carácter mercantil (locales comerciales con cuantía elevada), evaluar competencia comercial.

NUNCA inventes el tribunal. Si el expediente no precisa la ubicación exacta, marcalo como `[DATO PENDIENTE: tribunal competente según ubicación del inmueble]`.

# Estructura

1. **Encabezado** centrado:
   - "**REPÚBLICA DOMINICANA**" en ALL CAPS + negrita.
   - Línea con el tribunal: "**[Tribunal en ALL CAPS]**".
   - Acto No., año (queda como `[DATO PENDIENTE: No. de acto del alguacil]` hasta que el cliente lo asigne).

2. **Comparecencia del actor**:
   - "En la ciudad de [Ciudad], a los [día en letras] (DD) días del mes de [mes] del año [año en letras] (AAAA), …"
   - El demandante (arrendador): nombre Title Case + negrita, generales completas, domicilio elegido en el estudio de LDP Legal Advisors situado en [dirección de la oficina].

3. **Designación del demandado**:
   - El arrendatario moroso con sus generales completas según el contrato de alquiler.

4. **A** ([destinatario del acto] — quien recibe el acto):
   - Fórmula del alguacil: "**A**: el(la) señor(a) **[Nombre del Demandado]**, quien tiene como domicilio …"

5. **Hecho** (narrativa cronológica, párrafos numerados con "**ATENDIDO**" o sub-párrafos):
   - Existencia del contrato de alquiler (fecha, partes, inmueble, canon mensual).
   - Mora del arrendatario: mes(es) impagos. Cita literal de fechas y cuantías que aparezcan en el expediente; nunca redondees.
   - Intimaciones previas si las hay (acto de alguacil, comunicaciones extrajudiciales, recibos no honrados).
   - Persistencia de la mora a la fecha de la demanda.

6. **Derecho** (fundamentación):
   - Ley 85-25 (artículos sobre desahucio por falta de pago).
   - Cláusulas del contrato (referenciar la cláusula exacta del depósito y del pago).
   - Código Civil cuando aplique (arts. sobre obligaciones del arrendatario).

7. **Pedimentos** (numerados en romanos: PRIMERO, SEGUNDO, ...):
   - I. **DECLARAR** regular y válida en cuanto a la forma la presente demanda.
   - II. **CONDENAR** al demandado al pago de los cánones vencidos (cifra exacta + en letras y números).
   - III. **ORDENAR** el desalojo del inmueble objeto del contrato.
   - IV. **CONDENAR** al pago de los intereses legales desde la fecha de la demanda.
   - V. **ORDENAR** la ejecución provisional de la sentencia.
   - VI. **CONDENAR** al demandado al pago de las costas con distracción a favor del Lic./Dr. [abogado firmante de LDP], quien afirma estarlas avanzando en su mayor parte.

8. **Cierre**:
   - "Bajo todas las reservas de derecho."
   - Firma del abogado postulante: nombre + matrícula del Colegio de Abogados + LDP Legal Advisors.

# Reglas de contenido

- NUNCA inventes el monto del canon o las fechas de mora. Si no están en los documentos del expediente, marcá `[DATO PENDIENTE: monto mensual del canon]` y `[DATO PENDIENTE: meses vencidos]`.
- NUNCA omitas la cláusula del contrato citada — leéla con `read_document` si no la tenés a mano.
- Cifras en letras primero, números entre paréntesis: "la suma de **CUARENTA Y CINCO MIL PESOS DOMINICANOS CON 00/100 (RD$45,000.00)**".
- Designaciones de partes en ALL CAPS + negrita la primera vez, después solo negrita.

# Formato de salida

Aplicar reglas universales de `ldp-base` (Charter Roman 11pt, justify, márgenes 1.00"/1.25"). Sin header/footer institucional de LDP en este documento — la demanda lleva el encabezado judicial.
