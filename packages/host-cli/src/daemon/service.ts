import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface ServiceConfig {
  name: string;
  description?: string;
  execPath: string;
  user?: string;
  group?: string;
  workingDirectory?: string;
  environment?: Record<string, string>;
  restartPolicy?: 'always' | 'on-failure' | 'no';
  restartSec?: number;
  pidFile?: string;
  enable?: boolean;
  healthCheck?: {
    interval: number;
    timeout: number;
    retries: number;
    command: string;
  };
}

export interface ServiceStatus {
  active: boolean;
  running: boolean;
  status: string;
}

export class ServiceManager {
  generateSystemdService(config: ServiceConfig): string {
    const lines: string[] = [];

    // Unit section
    lines.push('[Unit]');
    lines.push(`Description=${config.description || config.name}`);
    lines.push('After=network.target');
    lines.push('');

    // Service section
    lines.push('[Service]');
    lines.push('Type=simple');
    lines.push(`ExecStart=${config.execPath}`);

    if (config.user) {
      lines.push(`User=${config.user}`);
    }

    if (config.group) {
      lines.push(`Group=${config.group}`);
    }

    if (config.workingDirectory) {
      lines.push(`WorkingDirectory=${config.workingDirectory}`);
    }

    if (config.pidFile) {
      lines.push(`PIDFile=${config.pidFile}`);
    }

    // Environment variables
    if (config.environment) {
      for (const [key, value] of Object.entries(config.environment)) {
        lines.push(`Environment="${key}=${value}"`);
      }
    }

    // Restart policy
    const restartPolicy = config.restartPolicy === 'no' ? 'no' :
                         config.restartPolicy === 'on-failure' ? 'on-failure' : 'always';
    lines.push(`Restart=${restartPolicy}`);

    if (config.restartSec) {
      lines.push(`RestartSec=${config.restartSec}`);
    }

    // Health check
    if (config.healthCheck) {
      lines.push(`ExecStartPost=/bin/sh -c '${config.healthCheck.command}'`);
    }

    lines.push('');

    // Install section
    lines.push('[Install]');
    lines.push('WantedBy=multi-user.target');

    return lines.join('\n');
  }

  generateInitScript(config: ServiceConfig): string {
    const lines: string[] = [];

    lines.push('#!/bin/sh');
    lines.push(`# ${config.name}`);
    lines.push(`# ${config.description || config.name}`);
    lines.push('');
    lines.push('case "$1" in');
    lines.push('  start)');
    lines.push(`    echo "Starting ${config.name}..."`)

    if (config.user) {
      lines.push(`    su - ${config.user} -c "${config.execPath} &"`);
    } else {
      lines.push(`    ${config.execPath} &`);
    }

    if (config.pidFile) {
      lines.push(`    echo $! > ${config.pidFile}`);
    }

    lines.push('    ;;');
    lines.push('  stop)');
    lines.push(`    echo "Stopping ${config.name}..."`);

    if (config.pidFile) {
      lines.push(`    if [ -f ${config.pidFile} ]; then`);
      lines.push(`      kill $(cat ${config.pidFile})`);
      lines.push(`      rm ${config.pidFile}`);
      lines.push('    fi');
    }

    lines.push('    ;;');
    lines.push('  restart)');
    lines.push('    $0 stop');
    lines.push('    sleep 2');
    lines.push('    $0 start');
    lines.push('    ;;');
    lines.push('  status)');

    if (config.pidFile) {
      lines.push(`    if [ -f ${config.pidFile} ]; then`);
      lines.push(`      if kill -0 $(cat ${config.pidFile}) 2>/dev/null; then`);
      lines.push(`        echo "${config.name} is running"`);
      lines.push('      else');
      lines.push(`        echo "${config.name} is not running"`);
      lines.push('      fi');
      lines.push('    else');
      lines.push(`      echo "${config.name} is not running"`);
      lines.push('    fi');
    }

    lines.push('    ;;');
    lines.push('  *)');
    lines.push('    echo "Usage: $0 {start|stop|restart|status}"');
    lines.push('    exit 1');
    lines.push('    ;;');
    lines.push('esac');

    return lines.join('\n');
  }

  async installSystemdService(config: ServiceConfig): Promise<void> {
    const serviceContent = this.generateSystemdService(config);
    const servicePath = `/etc/systemd/system/${config.name}.service`;

    fs.writeFileSync(servicePath, serviceContent, 'utf8');

    // Reload systemd
    execSync('systemctl daemon-reload');

    // Enable if requested
    if (config.enable) {
      execSync(`systemctl enable ${config.name}.service`);
    }
  }

  async uninstallSystemdService(name: string): Promise<void> {
    const servicePath = `/etc/systemd/system/${name}.service`;

    if (fs.existsSync(servicePath)) {
      // Stop and disable service
      try {
        execSync(`systemctl stop ${name}.service`);
        execSync(`systemctl disable ${name}.service`);
      } catch {
        // Service might not be running
      }

      // Remove service file
      fs.unlinkSync(servicePath);

      // Reload systemd
      execSync('systemctl daemon-reload');
    }
  }

  async installService(config: ServiceConfig): Promise<void> {
    if (this.hasSystemd()) {
      await this.installSystemdService(config);
    } else {
      // Fall back to init.d
      const script = this.generateInitScript(config);
      const scriptPath = `/etc/init.d/${config.name}`;

      fs.writeFileSync(scriptPath, script, 'utf8');
      fs.chmodSync(scriptPath, '755');
    }
  }

  hasSystemd(): boolean {
    return fs.existsSync('/run/systemd/system');
  }

  async startService(name: string): Promise<void> {
    if (this.hasSystemd()) {
      execSync(`systemctl start ${name}.service`);
    } else {
      execSync(`/etc/init.d/${name} start`);
    }
  }

  async stopService(name: string): Promise<void> {
    if (this.hasSystemd()) {
      execSync(`systemctl stop ${name}.service`);
    } else {
      execSync(`/etc/init.d/${name} stop`);
    }
  }

  async restartService(name: string): Promise<void> {
    if (this.hasSystemd()) {
      execSync(`systemctl restart ${name}.service`);
    } else {
      execSync(`/etc/init.d/${name} restart`);
    }
  }

  async getServiceStatus(name: string): Promise<ServiceStatus> {
    try {
      const output = execSync(`systemctl status ${name}.service`).toString();
      const active = output.includes('Active: active');
      const running = output.includes('(running)');

      return {
        active,
        running,
        status: output
      };
    } catch {
      return {
        active: false,
        running: false,
        status: 'Service not found or not running'
      };
    }
  }
}