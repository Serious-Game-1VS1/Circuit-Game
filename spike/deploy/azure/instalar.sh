#!/usr/bin/env bash
# Instala/actualiza el arbitro en Ubuntu 24.04. Idempotente. Uso (desde la carpeta del repo o con el codigo ya
# copiado a /opt/circuitsync/spike):  sudo bash instalar.sh
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Ejecuta con sudo"; exit 1; }

AQUI="$(cd "$(dirname "$0")" && pwd)"
SPIKE=/opt/circuitsync/spike
ENVF=/etc/circuitsync/arbitro.env

# Node 22 LTS (NodeSource) si falta o es menor a 20
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  apt-get update -y && apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

id arbitro >/dev/null 2>&1 || useradd --system --home /opt/circuitsync --shell /usr/sbin/nologin arbitro
mkdir -p /opt/circuitsync /etc/circuitsync /var/lib/circuitsync/docente

# Si el script corre desde un clon (.../spike/deploy/azure) y el destino no es ese, sincroniza el spike/
ORIGEN="$(cd "$AQUI/../.." && pwd)"
if [ "$ORIGEN" != "$SPIKE" ] && [ -f "$ORIGEN/package.json" ]; then
  mkdir -p "$SPIKE"
  tar -C "$ORIGEN" --exclude=node_modules --exclude=.env --exclude=data --exclude=bench-out -cf - . | tar -C "$SPIKE" -xf -
fi
[ -f "$SPIKE/package.json" ] || { echo "No hay codigo en $SPIKE (copia spike/ alli)"; exit 1; }

# La plantilla solo se copia si no hay env (no pisa tu App ID)
if [ ! -f "$ENVF" ]; then
  install -m 640 -o root -g arbitro "$AQUI/arbitro.env.example" "$ENVF"
  echo ">> Creado $ENVF: editalo (PHOTON_APP_ID) y luego: sudo systemctl restart arbitro"
fi

chown -R arbitro:arbitro /opt/circuitsync /var/lib/circuitsync
# tsx es devDependency: se necesita npm ci completo
sudo -u arbitro bash -c "cd $SPIKE && npm ci"

install -m 644 "$AQUI/arbitro.service" /etc/systemd/system/arbitro.service
mkdir -p /etc/systemd/system/arbitro.service.d
install -m 644 "$AQUI/endurecimiento.conf" /etc/systemd/system/arbitro.service.d/endurecimiento.conf
systemctl daemon-reload
systemctl enable arbitro
if grep -v '^#' "$ENVF" | grep -q '<PEGA_AQUI>'; then
  echo ">> Falta editar $ENVF; el servicio no se inicia hasta entonces: sudo nano $ENVF && sudo systemctl restart arbitro"
else
  systemctl restart arbitro
  echo ">> Listo. Logs: journalctl -u arbitro -f"
fi
