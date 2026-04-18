# Finance Planner — Self-Hosted Setup

Tu finance planner hosteado gratis en Vercel con data sincronizada en Supabase.

## ⏱ Tiempo estimado: 15-20 minutos

---

## Paso 1: Crear cuenta en Supabase (3 min)

1. Ir a **https://supabase.com** → "Start your project"
2. Login con GitHub (lo más rápido)
3. Click "New Project"
4. Elegir un nombre (ej: `finance-planner`)
5. Crear un password fuerte para la DB (guardarlo en algún lado)
6. Region: **South America (São Paulo)** (más cerca de Argentina)
7. Click "Create new project" — tarda ~1 min en provisionarse

## Paso 2: Crear la tabla en Supabase (1 min)

1. En el dashboard del proyecto, click **SQL Editor** (ícono en el sidebar)
2. Click "New query"
3. Copiar y pegar **todo el contenido de `supabase-setup.sql`**
4. Click "Run" (botón abajo a la derecha)
5. Debería decir "Success. No rows returned"

## Paso 3: Obtener las credenciales (1 min)

1. En el sidebar de Supabase, click **Project Settings** (⚙️ abajo)
2. Click **API**
3. Copiar dos valores:
   - **Project URL** → va a ser tu `VITE_SUPABASE_URL`
   - **anon public key** (el primero, "anon / public") → va a ser tu `VITE_SUPABASE_ANON_KEY`

## Paso 4: (Opcional pero recomendado) Bloquear signups públicos

Así nadie más que vos puede registrarse:

1. En Supabase: **Authentication** → **Providers** → **Email**
2. Desactivar "Confirm email" si querés loguearte sin confirmar mail (más rápido)
3. **Authentication** → **Settings** → Desactivar **"Enable new user signups"** DESPUÉS de crear tu usuario

Primero creá tu usuario (desde la app), después desactivás signups.

## Paso 5: Correr el proyecto local (3 min)

```bash
cd finance-app
npm install
cp .env.example .env
# Editar .env y pegar tus credenciales
npm run dev
```

Abrir http://localhost:5173. Crear tu cuenta. Confirmar el mail si Supabase te lo pide.

## Paso 6: Subir a GitHub (3 min)

```bash
git init
git add .
git commit -m "Initial commit"
```

Crear un repo en GitHub (https://github.com/new), después:

```bash
git remote add origin https://github.com/TU_USUARIO/finance-planner.git
git branch -M main
git push -u origin main
```

## Paso 7: Deploy a Vercel (5 min)

1. Ir a **https://vercel.com** → Login con GitHub
2. Click "Add New..." → "Project"
3. Importar tu repo de GitHub
4. En **Environment Variables**, agregar:
   - `VITE_SUPABASE_URL` = tu URL de Supabase
   - `VITE_SUPABASE_ANON_KEY` = tu anon key
5. Click "Deploy"
6. En ~30 segundos tenés tu URL: `tuapp.vercel.app`

## Paso 8: Agregar a tu home screen (1 min)

**En el celu (iOS):**
- Abrir la URL en Safari
- Botón "Compartir" → "Añadir a pantalla de inicio"

**En el celu (Android):**
- Abrir la URL en Chrome
- Menú → "Instalar app"

**En la PC (Mac con Chrome):**
- Abrir la URL
- En la barra de direcciones, clickear el ícono de "Instalar"

Listo — icono en tu pantalla de inicio, se abre como app, y todos los dispositivos están sincronizados a través de tu cuenta de Supabase.

---

## Actualizar la app

Cualquier cambio que hagas al código, solo:

```bash
git add .
git commit -m "update"
git push
```

Vercel detecta el push y redeploya automáticamente. Tus usuarios ven la nueva versión al recargar.

## Tu data está segura

- Row Level Security activado: solo VOS podés leer/escribir tu data
- Supabase tier gratuito incluye backups diarios
- Para exportar todo: Supabase dashboard → Table Editor → finance_data → Export CSV

## Costos

- **Vercel Hobby**: gratis (100GB bandwidth/mes, sobra y te sobra)
- **Supabase Free**: gratis (500MB DB, 50K usuarios activos — imposible pasarse para uso personal)

Todo gratis mientras sea personal.
