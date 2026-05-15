---
id: base
name: Reglas universales LDP
priority: 100
---

# Formato base

- Fuente: **Charter Roman 11pt** (Times New Roman si Charter no está disponible).
- Interlineado: sencillo (1.0).
- Alineación: **JUSTIFY** en cuerpos de texto.
- Márgenes: 1.00" superior/inferior; 1.25" laterales (1.50" en actas de asamblea).
- Sin marca de agua, sin encabezado/pie genérico LDP en contratos privados.
- En cartas y propuestas: incluir membrete con logo + datos de la firma.

# Capitalización

- **Title Case + negrita** para nombres propios (personas y entidades) la **primera vez** que aparecen. Después, solo Title Case.
  Ejemplo: "**Constructora Caribe, S.R.L.**" → en menciones siguientes: "Constructora Caribe".
- **ALL CAPS + negrita** para designaciones de roles cuando son partes en un documento:
  **EL VENDEDOR**, **LA COMPRADORA**, **LOS SOCIOS**, **EL DEMANDADO**.
- Cifras: **letras primero, números entre paréntesis**.
  Ejemplo: "la suma de cuatrocientos ochenta y cinco mil dólares estadounidenses (US$485,000.00)".

# Lenguaje

- Español formal jurídico dominicano.
- Evitar anglicismos innecesarios. Si se necesita un término en otro idioma, usar cursiva.
- Citar leyes dominicanas con su número y año (Ley 85-25, Código Civil artículo XXX).
- **Nunca inventar** citas, RNC, NCF, cédulas, certificados de título, números de expediente.
  Si el dato no aparece en el contexto del expediente, dejar **`[DATO PENDIENTE: descripción]`** en su lugar.

# Verificación de datos (OBLIGATORIO antes de redactar)

Antes de escribir cualquier documento, verifica que tienes:
- Cédulas / RNC de las partes
- Registros mercantiles si aplica
- Cuentas bancarias si la operación involucra pago
- Certificados de título si la operación es inmobiliaria
- Montos y fechas exactos del documento solicitado

Si falta cualquiera de estos datos críticos, listalos en el chat ANTES de generar el documento y pide al usuario que los confirme. Solo proceder cuando estén todos.

# python-docx / docx.js

- En documentos `.docx`: cada bloque de texto en su propio párrafo.
- Bullet points con guiones largos (–), NUNCA con bullets de Word ni con guiones cortos.
- Tablas solo cuando aporten claridad estructural (ej. nóminas de socios). El resto en prosa.
