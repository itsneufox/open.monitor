FROM docker.io/rclone/rclone:1.74.3 AS rclone

FROM docker.io/library/mysql:8.0

COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY backup.sh /usr/local/bin/openmonitor-backup

RUN chmod 0755 /usr/local/bin/openmonitor-backup

ENTRYPOINT ["/usr/local/bin/openmonitor-backup"]
CMD ["schedule"]
