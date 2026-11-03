@echo off
title POPURRAPP - Tunel Seguro Celular
cls
echo ====================================================================
echo        INICIANDO TUNEL SEGURO HTTPS PARA USAR EN EL CELULAR
echo ====================================================================
echo Recuerda que la app (npm run dev) debe estar abierta en otra ventana.
echo Generando enlace seguro y codigo QR...
echo ====================================================================
echo.
npm run tunnel
pause
