# Procesos y solicitudes

## Contrato y catálogo

`src/core/registry.mjs` valida el contrato y rechaza IDs duplicados o desconocidos. `src/processes/index.mjs` registra una sola instancia: cartera bancaria. El catálogo y la navegación consumen ese registro; no hay otra lista de procesos en HTML.

Cada adaptador declara `definition` (id, versión, nombre, descripción, objetivo, estado y contrato de dataset), `viewId`, `navigation`, `validate`, `analyse` y `loadView`. El catálogo muestra únicamente lo registrado. Un proceso no disponible no puede iniciarse. La vista se monta una sola vez para conservar filtros y datos al volver al catálogo. Un fallo de carga permite reintentar y no activa una vista incompleta.

Para añadir un proceso posteriormente: crear su motor con reglas y pruebas propias; definir un adaptador y una vista con un contenedor propio; registrarlo en `processes/index.mjs`. Reutilizar CSV, aritmética y componentes de presentación cuando corresponda. El empaquetador incluye los módulos de `core/` y `processes/` sin otra lista de rutas por proceso. Si se crean subdirectorios, habrá que ampliar esa copia, que actualmente recorre un nivel. No se ha implementado ningún segundo proceso.

La interfaz, las métricas, las tablas, los informes y el contexto Gemini del módulo bancario mantienen su significado. Un proceso futuro debe aportar sus informes y su adaptador de evidencia para IA antes de habilitar esas funciones: no se aplica el formato financiero bancario a cualquier dataset.

## Recepción real y límites

`src/core/process-request.mjs` comparte validación entre formulario y servidor. `worker/requests.mjs` solo acepta escrituras POST del mismo origen, JSON de hasta 8 KiB y los campos permitidos. No interpola los textos en SQL: usa parámetros. El correo es opcional. La respuesta no devuelve los textos ni el correo. No hay endpoint de lectura, listado, edición o descarga de solicitudes.

El esquema `db/0000_process_requests.sql` se aplica al iniciar el receptor **local**, mediante `scripts/local-request-db.mjs`, usando SQLite de Node 24. Se conserva el archivo `.sites-local/process-requests.sqlite` entre reinicios. No se crea ni altera una tabla dentro del handler de solicitudes. No se registran cuerpos ni datos de contacto en consola. La base y sus archivos auxiliares están excluidos de Git y no se incluyen en los assets ni en `dist/`.

Una única sentencia SQL admite y guarda la propuesta si no se han recibido 20 en la última hora y han pasado 15 segundos desde el último registro. La admisión no depende de la memoria del Worker. Estos límites compartidos pueden bloquear temporalmente a otros visitantes; no son una solución contra todos los abusos. La retención y eliminación de solicitudes alojadas debe definirse antes de la recepción pública de datos personales; no se ha añadido borrado automático.

Solo se muestra éxito con HTTP 201, identificador y fecha confirmados. Un fallo, cuota, receptor ausente o respuesta ambigua conserva los campos para revisión. Un tiempo de espera puede dejar una escritura realizada sin confirmación al navegador; no hay reintento automático. El formulario lo advierte y recomienda evitar duplicados. No hay correo ni promesa de notificación automática.

## Almacenamiento alojado y consulta administrativa

La inspección previa a la activación devolvió cero bindings y cero tablas para IndagaData. Esta revisión declara `d1: "DB"` y mantiene `r2: null`. La migración generada en `drizzle/` crea únicamente `process_requests` y su índice de fecha. `scripts/build.mjs` copia SQL, snapshot y journal a `dist/.openai/drizzle`, igual que el starter de Sites. `scripts/validate-artifact.mjs` comprueba ese contenido antes de publicar. La plataforma aplica las migraciones antes de cargar el Worker; no se ejecutan CREATE o ALTER desde el formulario. No se copian registros de la base local a producción.

El propietario consulta las propuestas mediante la configuración privada de Sites y su visor de base de datos, seleccionando el binding `DB` y la tabla `process_requests`. La cuenta administradora también puede utilizar las herramientas autenticadas de Sites para listar tablas y leer sus registros. El visor y el conector usan la autenticación y los permisos de la plataforma; la web de IndagaData no contiene un endpoint de lectura ni una contraseña administrativa propia. Antes de la activación se verificó la cuenta propietaria y cero editores. No se cambian las audiencias del sitio para implementar este acceso. Los visitantes públicos pueden enviar sin iniciar sesión. La privacidad frente a visitantes no excluye el acceso operativo de los administradores del proveedor.

Para generar otra migración después de cambiar `db/schema.mjs`, instalar las dependencias de desarrollo con `npm ci --ignore-scripts` y ejecutar `npm run db:generate`. Revisar y conservar SQL, snapshots y journal. Nunca modificar migraciones ya aplicadas. El contrato del esquema local se contrasta con la migración alojada mediante pruebas; los datos locales permanecen fuera de Git y del artefacto.

La aceptación en producción requiere un envío desde la web pública, comprobación de su identificador y campos desde el acceso autenticado del propietario a D1, lectura posterior, rechazo de métodos de lectura y de rutas de base/esquema, y revisión de las respuestas y assets públicos. Esas comprobaciones se registran en la evidencia de despliegue; la mera presencia del binding no acredita recepción correcta.

Fuentes oficiales: [almacenamiento](https://learn.chatgpt.com/docs/sites/data-and-connections), [configuración y bindings](https://learn.chatgpt.com/docs/sites/managing-a-site), [acceso](https://learn.chatgpt.com/docs/sites/publishing-and-sharing), [precio de Sites](https://learn.chatgpt.com/docs/pricing). Sites está incluido en planes elegibles durante la beta pública; eso no garantiza gratuidad permanente ni sustituye revisar las condiciones de la cuenta. No se ha activado facturación.
