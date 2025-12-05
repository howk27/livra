@echo off
echo Setting up Livra...
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Node.js is not installed. Please install Node.js 18+ first.
    exit /b 1
)

echo Node.js detected
echo.

REM Install dependencies
echo Installing dependencies...
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo Failed to install dependencies
    exit /b 1
)

echo Dependencies installed
echo.

REM Create .env file if it doesn't exist
if not exist .env (
    echo Creating .env file...
    (
        echo EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
        echo EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
    ) > .env
    echo .env file created
    echo Please update .env with your Supabase credentials
) else (
    echo .env file already exists
)

echo.
echo Setup complete!
echo.
echo Next steps:
echo 1. Update your .env file with Supabase credentials (optional)
echo 2. Run 'npm start' to start the development server
echo 3. Press 'i' for iOS, 'a' for Android, or 'w' for web
echo.
echo Happy tracking!

