# pgBackRest image. Used twice: as the `backup` service and as the db
# image when backup is enabled (archive_command needs the binary).
FROM postgres:16-alpine

RUN apk add --no-cache pgbackrest rclone jq openssl tzdata busybox-extras

COPY *.sh /opt/backup/
COPY pgbackrest.db.conf /opt/backup/pgbackrest.db.conf
COPY www /opt/backup/www
RUN chmod +x /opt/backup/*.sh /opt/backup/www/cgi-bin/* \
 && mkdir -p /var/lib/backup /etc/pgbackrest/tls /scratch \
 && chown -R postgres:postgres /var/lib/backup /etc/pgbackrest /scratch

ENV TZ=Asia/Bangkok
EXPOSE 8432 9099
ENTRYPOINT ["/opt/backup/entrypoint.sh"]
