---
id: contratos-compraventa
name: Contrato de Compraventa de Inmueble
matter_types: [real_estate, civil]
document_types: [contrato-compraventa, contrato-venta]
output: docx
priority: 55
---

# Marco legal vigente

- **Código Civil dominicano**, artículos 1582 y siguientes (de la venta).
- **Ley 108-05 de Registro Inmobiliario** y su reglamento (cuando el inmueble está bajo el sistema Torrens).
- **Ley 18-88** sobre Impuesto al Patrimonio Inmobiliario / Vivienda Suntuaria (IPI) si aplica.
- **Ley 87-01** sobre Sistema Dominicano de Seguridad Social (en operaciones que involucren cuotas patronales).
- Cuando el comprador sea extranjero: verificar Reglamento de Inversión Extranjera (no requiere autorización especial para inmuebles, pero declarar en BCRD si supera USD 100K).

# Estructura

1. **Designación de partes** (ALL CAPS + negrita la primera vez):
   - **EL VENDEDOR**: nombre Title Case, dominicano/extranjero, mayor de edad, estado civil, ID + número, domicilio.
   - **EL COMPRADOR** o **LA COMPRADORA**: misma estructura. Si es extranjero, incluir pasaporte y país.

2. **Considerandos** (cada uno empieza con **"Por cuanto"** en negrita):
   - **Por cuanto**: el vendedor es legítimo propietario del inmueble descrito en la cláusula primera, según consta en el Certificado de Título No. [número] expedido por el Registrador de Títulos de [jurisdicción].
   - **Por cuanto**: el inmueble se encuentra libre de gravámenes / con los gravámenes que se detallan más adelante (NUNCA omitir si existen).
   - **Por cuanto**: el comprador ha verificado el estado físico y jurídico del inmueble y manifiesta su voluntad de adquirirlo.

3. **Cláusulas** (numeradas en romanos: PRIMERA, SEGUNDA, ...). Mínimas:

   **PRIMERA — Identificación del Inmueble**. Designación catastral exacta:
   - Parcela / Solar No.
   - Distrito Catastral / Manzana.
   - Municipio y Provincia.
   - Superficie en metros cuadrados (en letras y números).
   - Linderos según el certificado.
   - Cualquier mejora levantada (apartamento, casa, local) con su número, piso, área construida, y matrícula si está individualizada.

   **SEGUNDA — Precio**. Monto en letras primero y números entre paréntesis (ej.: "**CUATROCIENTOS OCHENTA Y CINCO MIL DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA (US$485,000.00)**"). Especificar moneda y, si se paga en RD$, la tasa de referencia (BCRD del día de la firma).

   **TERCERA — Forma de Pago**. Por ejemplo:
   - 30% como inicial al momento de firmar este contrato, vía [cheque certificado / transferencia / promesa de compraventa previa con cuota inicial].
   - 70% balance al cierre, contra entrega del Certificado de Título a nombre del comprador, dentro del plazo de [N] días contados a partir de la firma.
   - Si hay financiamiento bancario: identificar entidad financiera y condiciones.

   **CUARTA — Entrega del Inmueble**. Fecha exacta. Estado en que se entrega (vacío, con mobiliario, etc.).

   **QUINTA — Saneamiento**. El vendedor declara que el inmueble está libre de cargas, hipotecas, anticresis, embargos, oposiciones, arrendamientos no declarados, o cualquier gravamen no listado expresamente. Responde por evicción y vicios ocultos conforme al Código Civil.

   **SEXTA — Gastos**. Reparto entre las partes:
   - Honorarios del notario actuante: comprador (uso típico LDP).
   - Impuesto de transferencia (3% del valor del inmueble según DGII): comprador.
   - Gastos de registro y certificación de cancelación de hipoteca anterior si aplica: vendedor.
   - Honorarios profesionales LDP: la parte que contrata.

   **SÉPTIMA — Tradición de los documentos**. Listar exactamente qué documentos entrega el vendedor al comprador en el acto de cierre (Certificado de Título original, certificación de cargas, deslinde si aplica, recibos del IPI al día, recibos de servicios públicos).

   **OCTAVA — Cláusula penal**. Penalidad por incumplimiento (porcentaje del precio, típicamente 10-20%).

   **NOVENA — Domicilio elegido**. Las partes eligen domicilio en sus residencias respectivas para todos los fines y consecuencias del contrato. Para LDP, se elige domicilio adicional en el estudio profesional.

   **DÉCIMA — Ley aplicable y jurisdicción**. Ley dominicana. Tribunales de [provincia donde está el inmueble].

4. **Firma**: en [Ciudad], a los [día en letras] (DD) días del mes de [mes] del año [año en letras] (AAAA). Una firma por cada parte, dos testigos, firma y sello del notario.

# Reglas de contenido

- NUNCA inventes el Certificado de Título. Si no aparece en los documentos del expediente, leé el certificado con `read_document` antes de redactar. Si no está cargado, marcalo como `[DATO PENDIENTE: número de Certificado de Título]`.
- NUNCA omitas un gravamen detectable en la certificación de cargas. Es responsabilidad profesional crítica.
- Si el comprador es extranjero, incluí cláusula breve mencionando que cumple con la normativa de inversión extranjera vigente.
- NO incluyas cláusulas de mediación obligatoria salvo instrucción expresa.

# Formato de salida

Reglas de `ldp-base`: Charter Roman 11pt, justify, márgenes 1.00", SIN header/footer LDP. Firma de las partes con dos líneas de espacio entre nombre y firma.
