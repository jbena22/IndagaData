# IndagaData

MVP de investigación de variaciones de cartera bancaria, desarrollado con Codex para Big School. Solo incluye el proceso bancario y datos sintéticos autorizados en COP. Hay componentes comunes y un registro de procesos; la interfaz y los informes aún están especializados en cartera bancaria.

## Ejecutar localmente

Necesita Node.js 20 o posterior. No hay paquetes de producción que instalar. Ejecutar desde `app/` en la carpeta de trabajo, o desde la raíz de la copia preparada para GitHub:

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

La declaración no garantiza el plan: debe verificarse que el proyecto no tenga facturación. Las cuotas efectivas se consultan en AI Studio. Espera de cortesía de 15 segundos por identidad/isolate, sin reintentos automáticos; el límite global es el de Google. Tiempo máximo de espera 25 segundos. El texto generado se muestra como interpretación de IA y no se incluye en los informes deterministas.

Referencias oficiales: [precios](https://ai.google.dev/gemini-api/docs/pricing), [cuotas](https://ai.google.dev/gemini-api/docs/rate-limits), [generateContent](https://ai.google.dev/gemini-api/docs/text-generation). La modalidad gratuita puede usar datos para mejorar los productos de Google; el consentimiento lo informa. No hay cambio automático a otros modelos ni activación de facturación.

## Estructura y documentación

`src/core/` contiene CSV y aritmética; `src/processes/banking.mjs` contiene las reglas bancarias; `src/ui.mjs`, `src/report.mjs` y `worker/api.mjs` separan interfaz, informes e IA. El puente descompone la variación entre créditos presentes en ambos cortes, entradas y salidas del ámbito filtrado. Las migraciones solo consideran créditos presentes en ambos cortes. Ninguno de esos desgloses demuestra desembolsos, cancelaciones o causas del cambio.

Los borradores existentes de `docs/` quedan pendientes de revisión final y no se incluyen en la copia propuesta. Las evidencias técnicas seleccionadas están en `evidence/`. La documentación definitiva, Drive y vídeo se prepararán después de estabilizar las funcionalidades.

La versión 2 de Sites sigue pública en https://indagadata-cartera.jhonattangbc.chatgpt.site. Este código local incluye cambios posteriores que no se han desplegado. Construir y probar no publica versiones. GitHub requiere aprobación del contenido antes del primer commit y push; los permisos del sitio se administran por separado.

No se implementó formulario de nuevos procesos: el núcleo tiene prioridad y no hay correo ni envío simulado.
