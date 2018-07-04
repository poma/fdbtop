# fdbtop
Display and update sorted information about FoundationDB processes

# Installation

npm install -g fdbtop

# Usage

```
fdbtop
fdbtop --help
fdbtop -i 10 -- -C fdb.cluster --tls_certificate_file cert
ssh foo "fdbcli --exec 'status json'" | fdbtop
```

You can use '<' and '>' to change the sort column. Press ESC or CRTL-C to exit. Can be used in non-interactive mode if you pipe an fdb status json to it. Arguments that come after '--' will be passed to the fdbcli. IOPS are mesured in thousands, network in mbps.

# Example output

```
<ip>          port    cpu%  mem%  iops  net    class                 roles
------------  ------  ----  ----  ----  -----  --------------------  --------------------
 10.0.2.101    4500    5     3     6     2      cluster_controller    cluster_controller
               4501    84    6     6     143    transaction           log
               4504    1     2     6     0      proxy
               4505    87    3     6     182    proxy                 proxy
               4506    0     3     6     0      resolution
               4507    27    2     6     9      master                master
------------  ------  ----  ----  ----  -----  --------------------  --------------------
 10.0.2.102    4500    58    6     4     91     transaction           log
               4501    1     2     4     0      proxy
               4504    58    3     4     116    proxy                 proxy
               4505    58    3     4     117    proxy                 proxy
               4506    38    4     4     34     resolution            resolver
               4507    0     2     4     0      master
------------  ------  ----  ----  ----  -----  --------------------  --------------------
 10.0.2.103    4500    83    16    33    46     storage               storage
               4501    0     2     33    0      proxy
               4503    92    18    33    78     storage               storage
               4504    45    3     33    102    proxy                 proxy
               4505    0     2     33    0      proxy
               4506    25    3     33    30     resolution            resolver
               4507    0     2     33    0      master
------------  ------  ----  ----  ----  -----  --------------------  --------------------
 10.0.2.104    4500    96    17    22    76     storage               storage
               4501    79    3     22    166    proxy                 proxy
               4503    98    16    22    75     storage               storage
               4504    0     2     22    0      proxy
```
