# Validación integral local — 16 de octubre de 2026

## Resultado y alcance

Tres consultas reales desde la interfaz local con `gemini-3.5-flash-lite` devolvieron HTTP 200 y finalizaron con `STOP`. Se contrastaron selección, petición del navegador, evidencia recalculada, payload enviado a Google y respuesta visible. La evidencia y las cifras coinciden con la selección activa. La revisión manual de las tres respuestas no encontró causas afirmadas sin respaldo. La suite completa aprobó **46 pruebas, sin fallos**.

Este resultado permite preparar una candidata local revisable. No equivale a una publicación ni al cierre de los entregables del hackathon. No se hizo commit, push, cambio de permisos o despliegue. No se comenzó Drive ni la documentación definitiva. Se conservaron la versión 2 pública, el CSV original y la propuesta GitHub del 15 de octubre.

## Corrección de unidades para Gemini

La respuesta real anterior pedía al modelo convertir centavos al redactar. Para eliminar esa dependencia de cálculo, `worker/api.mjs` incorpora `geminiEvidence`: convierte solo los campos monetarios conocidos en cadenas decimales exactas en COP, mediante aritmética entera. Incluye totales, variaciones, aportes, evolución, puente y migraciones. Ratios, puntos porcentuales y recuentos no se escalan. El prompt exige presentar importes directamente en COP.

El motor financiero, filtros, fórmulas, HTML, CSV y evidencia JSON descargable mantienen su contrato anterior; el JSON de análisis continúa en centavos. Solo la evidencia de la integración Gemini se representa en COP. La interfaz no requirió cambios de producción en esta tarea.

Se añadieron cuatro regresiones: conversión monetaria completa sin mutar el resultado; payload/evidencia con filtros y sin filtros; selección enviada por la UI y limpieza de respuesta; rechazo de respuesta en vuelo tras cambiar filtros y bloqueo con un corte. Se corrigió una expectativa inicial de la prueba: `TextDecoder` elimina el BOM de UTF-8. La huella del texto decodificado del request se distingue de la huella del archivo original; los registros y los importes son iguales.

## Generación real desde navegador

Se utilizó Codex In-app Browser y el Worker construido localmente. `scripts/serve_qa_gemini.mjs` observa el `fetch` nativo, sin mocks, y registra solo pregunta, selección, hash del texto CSV decodificado, agregados y respuesta. No guarda CSV, clave ni encabezados de autenticación. La modalidad gratuita confirmada por el participante se habilitó solo en memoria del proceso de QA. No se modificó facturación ni se cambió de modelo.

| Consulta | Selección | Resultado comprobado |
| --- | --- | --- |
| 001 | Noviembre→diciembre, sin filtros | Base 21.772.546.198 COP; actual 21.056.687.117 COP; variación −715.859.081 COP; libre inversión 35,86055… %. |
| 002 | Noviembre→diciembre, VEHICULO + BOGOTA | Base 1.006.183.221 COP; actual 980.609.235 COP; variación y aporte −25.573.986 COP; contribución neta 100 %. |
| 003 | Noviembre→diciembre, sin filtros, solicitando aporte explícito | Variación −715.859.081 COP; aporte de libre inversión −256.711.009 COP; contribución neta 35,86055… %. |

El payload enviado a Google y la evidencia retornada coinciden íntegramente con el motor y la selección observada en cada caso. El texto visible coincide con la respuesta del backend y su aviso. Las tres respuestas presentan importes en COP y no en centavos; el formato de separadores y la cantidad de decimales porcentuales varían entre respuestas. Las tres reconocen que el CSV no prueba las causas del cambio.

`consultas/consulta_001.json` a `consulta_003.json` conservan origen oficial de Google, modelo, estado, tiempo, uso de tokens, evidencia y respuesta. `verificacion_integral.json` resume las aserciones. Esto acredita las respuestas probadas; no incorpora un validador semántico general para cualquier consulta.

## Regresión y evidencia financiera

- `node scripts/build.mjs` y `node scripts/validate-artifact.mjs`: correctos.
- `node --test tests/*.test.mjs`: 46 aprobadas. Incluye un corte, filtros, selección Gemini, respuesta pendiente, comparaciones, población, migraciones, informes, exportación, errores controlados y aborto de un transporte simulado a los 25 segundos.
- Las 1.320 comparaciones financieras previas conservan sus resultados y conciliación exacta. El motor, UI, informe y archivos de datos conservan sus huellas previas.
- Oráculo pandas actualizado: 48 totales mensuales, 1.008 por segmento y 1.340 casos de puente/migraciones aprobados. Se corrigió la fecha fija del verificador para que registre la fecha de ejecución en Colombia; se conserva el primer archivo que aún decía 15 como evidencia del defecto de metadatos. Solo el archivo actualizado se propone para GitHub.
- Navegador real: consultas con y sin filtros; limpieza de respuesta al cambiar selección; muestra sintética con dos permanencias, una entrada y una salida; enero sin filtros y con VEHICULO, BOGOTA y ambos; restauración del original con doce cortes. Gemini y las comparaciones permanecen bloqueados para un corte. Se distinguió una observación transitoria durante carga del estado terminado. No se observaron errores JavaScript.
- Descargas reales filtradas HTML/JSON/CSV verificadas. El HTML incluye puente y migraciones; el JSON mantiene centavos. El CSV general es idéntico a la descarga archivada de v2 y conserva negativos numéricos. La protección de textos peligrosos sigue cubierta por las pruebas.

## Archivos principales de esta tarea

Producción: `worker/api.mjs`, `worker/index.js` generado. Pruebas: `tests/api.test.mjs` y `tests/ui-single-period.test.mjs`. Soporte: `scripts/verify_gemini_live.mjs`, `scripts/serve_qa_gemini.mjs`, fecha de `scripts/verify_variations_pandas.py`, README de ejecución y estas evidencias. No se modificaron el CSV original ni las fórmulas financieras.

## Límites pendientes

No se agotó deliberadamente una cuota real ni se auditó la consola de facturación; se conservó el proyecto sin facturación confirmado por el participante. Errores de cuota/acceso/conexión y timeout están cubiertos con transporte simulado. La espera de cortesía de 15 segundos sigue siendo por instancia, no un límite global. No se acreditan otros navegadores, Excel nativo ni PDF autónomo. Los informes de comparación siguen requiriendo dos cortes. Los separadores y la precisión porcentual del texto de Gemini pueden variar, aunque las cifras probadas son correctas.

La candidata queda pendiente de revisión del contenido exacto de GitHub y de autorización separada para commit/push o publicación. Catálogo, formulario, Drive y documentación definitiva permanecen fuera de esta validación.
