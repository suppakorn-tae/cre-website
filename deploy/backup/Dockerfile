# pgBackRest image. Used twice: as the `backup` service and as the db
# image when backup is enabled (archive_command needs the binary).
# Debian, not Alpine: Alpine has no pgBackRest with PostgreSQL 19
# support, so it comes from the PGDG apt repository the base image
# already lists. Keep the base equal to the db image in compose.yaml.
FROM postgres:19.0-trixie

# busybox gives crond and httpd (CGI metrics), as busybox-extras did on
# Alpine. procps gives pgrep for the healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      pgbackrest=2.60.1-1.pgdg13+1 rclone jq openssl tzdata busybox procps ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && ln -s /bin/busybox /usr/local/bin/crond \
 && ln -s /bin/busybox /usr/local/bin/httpd

COPY *.sh /opt/backup/
COPY pgbackrest.db.conf /opt/backup/pgbackrest.db.conf
COPY www /opt/backup/www
RUN chmod +x /opt/backup/*.sh /opt/backup/www/cgi-bin/* \
 && mkdir -p /var/lib/backup /etc/pgbackrest/tls /scratch \
 && chown -R postgres:postgres /var/lib/backup /etc/pgbackrest /scratch

ENV TZ=Asia/Bangkok
EXPOSE 8432 9099
ENTRYPOINT ["/opt/backup/entrypoint.sh"]
