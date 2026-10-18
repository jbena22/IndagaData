# IndagaData

MVP de investigación de variaciones de cartera bancaria, desarrollado con Codex para Big School. Solo incluye el proceso bancario y datos sintéticos autorizados en COP. El catálogo se genera desde un registro común; cada proceso declara su contrato, validación, motor y vista. No se han añadido otros procesos especializados.

## Ejecutar localmente

Necesita Node.js 24 para SQLite local. No hay paquetes de producción que instalar. Ejecutar desde la raíz del proyecto:

```powershell
node scripts/build.mjs
node scripts/serve.mjs
```

Abrir `http://127.0.0.1:4173`. El proceso usa la misma salida del Worker que Sites. Tras editar módulos, reconstruir y reiniciar el servidor (el Worker se importa al iniciar). Los originales CSV/PDF permanecen fuera de `app/`; `data/demo.csv` es la copia sintética de ejemplo autorizada para desplegar.

## Verificación

```powershell
node scripts/build.mjs
node --test tests/*.test.mjs
node scripts/validate-artifact.mjs
python scripts/verify_variations_pandas.py --output=evidence/reverificacion_pandas.json
```

Solo el último paso necesita pandas. Elegir un archivo de salida nuevo para conservar evidencias anteriores. Las pruebas automatizadas de Gemini utilizan una clave falsa y un transporte simulado; no consumen cuotas. La comprobación pandas contrasta sumas, uniones por crédito, población y migraciones con el motor de producción. El ejemplo y las pruebas no necesitan los originales externos.

## Uso

El ejemplo se carga automáticamente. Puedes importar otro CSV con las 24 columnas del contrato, máximo 50.000 filas y 5 MB. Un error bloquea todo el análisis. Advertencias no corrigen datos. Selecciona dos cortes distintos en orden y, opcionalmente, filtra producto/región. Elige métrica y dimensión para ver contribuciones firmadas, porcentajes y conciliación. El informe HTML puede abrirse sin conexión e imprimirse a PDF. JSON expresa importes en centavos de COP; CSV e informe usan pesos. No se persisten los archivos del visitante.

## Gemini opcional

Solo API Gemini, modelo fijo `gemini-3.5-flash-lite`, modalidad Standard gratuita. Usar una clave de un proyecto **sin facturación asociada**. El servidor necesita `GEMINI_API_KEY` y `GEMINI_FREE_TIER_CONFIRMED=true`, después de confirmar ese plan. Hereda las variables del proceso y después aplica `.env` si existe en el directorio de ejecución; `.env` tiene precedencia. Las variables de Windows añadidas después de iniciar Codex necesitan un proceso nuevo que las herede. Nunca subir `.env` ni introducir la clave en el navegador, chat, documentos o capturas.

Con la clave ausente o modalidad gratuita sin confirmar, el endpoint devuelve un estado controlado y el análisis permanece disponible. Una consulta requiere consentimiento. El servidor recibe temporalmente el CSV para volver a validar/recalcular; Google recibe agregados y pregunta, sin identificadores, ingresos ni tasas individuales. El adaptador de Gemini convierte solo los importes monetarios a cadenas decimales exactas en COP; ratios y recuentos mantienen su significado. El motor y el JSON descargable conservan centavos. Los nombres de segmentos y la pregunta también se envían: no incluyas información confidencial. El servidor normal no persiste CSV, claves ni cuerpos de solicitudes.

El 16 de octubre se verificaron tres consultas reales desde la interfaz local, con y sin VEHICULO + BOGOTA: HTTP 200, evidencia igual a la selección y cifras contrastadas con el motor. Esta comprobación no garantiza todas las preguntas ni todas las respuestas. No existe un validador semántico automático general.

Prueba real opcional de backend: `node scripts/verify_gemini_live.mjs --confirm-free-tier --output=evidence/nueva_prueba_gemini.json`. La declaración gratuita se aplica solo en memoria. Para QA de navegador, `node scripts/serve_qa_gemini.mjs --confirm-free-tier --output-dir=evidence/local_qa_nueva` inicia el mismo Worker y observa `fetch` nativo. Ese servidor de QA guarda selección, pregunta, agregados y respuestas saneadas, sin CSV ni clave; usar únicamente pruebas sintéticas autorizadas. No puede ejecutarse simultáneamente con el servidor normal en el puerto 4173. No se utiliza para desplegar. `verify_variations_browser.py` conserva la comprobación histórica del 15 de octubre y requiere las evidencias locales y el original externo.

La declaración no garantiza el plan: debe verificarse que el proyecto no tenga facturación. Las cuotas efectivas se consultan en AI Studio. Espera de cortesía de 15 segundos por identidad y por instancia, y 20 intentos diarios UTC por instancia, sin reintentos automáticos. Los contadores están en memoria: pueden reiniciarse al desplegar o escalar y no constituyen un máximo global persistente. El límite efectivo del proyecto es el de Google. No se aprovisionan R2, D1 ni servicios adicionales para estos contadores. Tiempo máximo de espera 25 segundos y salida máxima de 1.600 tokens. El texto generado se muestra como interpretación de IA y no se incluye en los informes deterministas.

Referencias oficiales: [precios](https://ai.google.dev/gemini-api/docs/pricing), [cuotas](https://ai.google.dev/gemini-api/docs/rate-limits), [generateContent](https://ai.google.dev/gemini-api/docs/text-generation). La modalidad gratuita puede usar datos para mejorar los productos de Google; el consentimiento lo informa. No hay cambio automático a otros modelos ni activación de facturación.

## Estructura y documentación

`src/core/` contiene CSV, aritmética, contrato de registro y validación de propuestas. `src/processes/index.mjs` registra cartera bancaria mediante `banking-definition.mjs`; `banking-ui.mjs` conserva su vista. `src/ui.mjs` coordina catálogo y selección; `src/report.mjs` y `worker/api.mjs` mantienen informes e IA. El puente descompone la variación entre créditos presentes en ambos cortes, entradas y salidas del ámbito filtrado. Las migraciones solo consideran créditos presentes en ambos cortes. Ninguno de esos desgloses demuestra desembolsos, cancelaciones o causas del cambio. Véase [procesos y solicitudes](docs/procesos_y_solicitudes.md).

La [versión 5 pública](https://indagadata-cartera.jhonattangbc.chatgpt.site) se desplegó el 17 de octubre de 2026 a las 21:18:46 de Colombia. Incorpora catálogo y recepción persistente de propuestas en D1, conservando Gemini y el motor financiero de la versión 4. Se verificaron 74 pruebas automatizadas, 39 comprobaciones HTTP de privacidad/validación y dos envíos sintéticos reales leídos desde administración autenticada. El CSV descargado conserva las variaciones negativas como números. La fuente publicada en Sites es `c2db1dd85b616c295ed11856b6559982a1dec28d`; su historial es independiente del de GitHub. Esta sincronización conserva el historial existente y no despliega otra versión de Sites.

Se entregan por separado la [documentación técnica](https://docs.google.com/document/d/10CuG1kXGFjWSf918azmoZZ1ba93RdE72WEOnl7RJLCM/edit) y el [historial de prompts](https://docs.google.com/document/d/15jdCWmHdlcX9l0p4gqr3nSodnTBmr3JslbuqIA4qGHs/edit), ambos como Google Docs en la [carpeta del hackathon](https://drive.google.com/drive/folders/1XuLlHWxwmVuHV4vJmviwLaNRU_YiQmk6). Se comprobó acceso anónimo de lectura a los dos documentos y al repositorio público. Los borradores locales anteriores no forman parte de esta entrega. Quedan pendientes el vídeo de máximo cinco minutos y el envío mediante el formulario oficial.

Gemini obtuvo respuestas reales en producción el 17 de octubre, HTTP 200, con `gemini-3.5-flash-lite`. Se contrastaron −715.859.081 COP de variación de saldo y −256.711.009 COP de aporte de libre inversión. `GEMINI_API_KEY` y `GEMINI_FREE_TIER_CONFIRMED` están configurados como secretos en Sites; no aparecen en el código ni en los recursos y respuestas HTTP comprobados. Tampoco se encontraron en los registros recientes disponibles del Worker. Google AI Studio mostró «Nivel gratuito» para una clave enmascarada cuyo sufijo coincide con la configurada; no se activó facturación ni ningún plan de pago. El motor determinista sigue disponible si la IA alcanza su cuota o falla. Una respuesta correcta no garantiza todas las preguntas: una consulta de QA respondió solo sobre el producto y omitió el total; una pregunta explícita y la prueba HTTP posterior sí devolvieron las cifras de cartera completas.

## Solicitudes de nuevos procesos

Formulario público sin registro, con nombre, problema, dataset y resultados esperados obligatorios y correo opcional. Solo confirma recepción tras una escritura real; no envía correo automático. Los campos se guardan de forma privada. No introducir información confidencial ni datos de clientes.

En local, `scripts/serve.mjs` aplica el esquema a `.sites-local/process-requests.sqlite`, excluido de Git y del artefacto. En Sites, el binding `DB` y las migraciones versionadas de `drizzle/` crean `process_requests`. El build las copia a `dist/.openai/drizzle`; no se ejecutan cambios de esquema desde peticiones HTTP. Para generar nuevas migraciones, usar `npm ci --ignore-scripts` y `npm run db:generate`; estas dependencias son solo de desarrollo. No modificar migraciones ya aplicadas.

El propietario consulta desde el visor privado de base de datos de Sites o mediante su conector autenticado, seleccionando `DB` → `process_requests`. No hay API pública de lectura, listado o exportación de propuestas. El límite compartido de recepción es persistente en D1: 20 registros por hora y 15 segundos entre registros. Es independiente del límite de cortesía de Gemini en memoria.

Un timeout puede producirse tras guardar: el formulario avisa y no reintenta automáticamente. Queda pendiente definir retención y eliminación; no existe borrado automático. No se activó facturación ni se contrataron servicios adicionales. El uso autorizado de D1 no garantiza que el proveedor mantenga sus condiciones indefinidamente. La verificación de v5 no incluyó una nueva generación real de Gemini; las respuestas reales descritas arriba pertenecen a las pruebas previas del 17 de octubre.
