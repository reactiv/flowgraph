---
name: dynamodb
description: Read and explore data from AWS DynamoDB tables. Use this skill when you need to scan tables, query by key, get item details, or list available tables.
---

# DynamoDB Data Access

This skill enables reading data from AWS DynamoDB tables using boto3.

## Authentication

DynamoDB requires AWS credentials. These can be provided via:
- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`)
- Mounted AWS credentials directory (`~/.aws`)
- `AWS_PROFILE` environment variable for named profiles (including SSO)

```python
import boto3

# Uses credentials from environment or ~/.aws
dynamodb = boto3.resource('dynamodb', region_name='us-west-1')
client = boto3.client('dynamodb', region_name='us-west-1')
```

### SSO Authentication

For AWS SSO, authenticate on the host first:

```bash
aws sso login --profile your-profile
```

Then set `AWS_PROFILE` in the container:

```python
import os
os.environ['AWS_PROFILE'] = 'your-sso-profile'

dynamodb = boto3.resource('dynamodb', region_name='us-west-1')
```

## Listing Tables

```python
import boto3

client = boto3.client('dynamodb', region_name='us-west-1')

# List all tables
tables = client.list_tables()['TableNames']
print("Tables:", tables)

# With pagination for many tables
def list_all_tables():
    tables = []
    paginator = client.get_paginator('list_tables')
    for page in paginator.paginate():
        tables.extend(page['TableNames'])
    return tables
```

## Getting Table Info

```python
# Describe table schema and metadata
response = client.describe_table(TableName='YourTableName')
table_info = response['Table']

print(f"Item count: {table_info['ItemCount']}")
print(f"Size: {table_info['TableSizeBytes']} bytes")

# Get key schema
for key in table_info['KeySchema']:
    print(f"Key: {key['AttributeName']} ({key['KeyType']})")

# Get attribute definitions
for attr in table_info['AttributeDefinitions']:
    print(f"Attribute: {attr['AttributeName']} ({attr['AttributeType']})")
```

## Reading Items

### Get Single Item by Key

```python
dynamodb = boto3.resource('dynamodb', region_name='us-west-1')
table = dynamodb.Table('YourTableName')

# Get by partition key only
response = table.get_item(Key={'pk': 'user-123'})
item = response.get('Item')

# Get by partition key + sort key
response = table.get_item(Key={
    'pk': 'user-123',
    'sk': 'profile'
})
```

### Query by Partition Key

```python
from boto3.dynamodb.conditions import Key

# Query all items with a partition key
response = table.query(
    KeyConditionExpression=Key('pk').eq('user-123')
)
items = response['Items']

# Query with sort key condition
response = table.query(
    KeyConditionExpression=Key('pk').eq('user-123') & Key('sk').begins_with('order#')
)

# Query with filter (applied after retrieval)
from boto3.dynamodb.conditions import Attr

response = table.query(
    KeyConditionExpression=Key('pk').eq('user-123'),
    FilterExpression=Attr('status').eq('active')
)
```

### Scan (Read All Items)

Use scan sparingly - it reads the entire table:

```python
# Basic scan with limit
response = table.scan(Limit=100)
items = response['Items']

# Scan with filter
response = table.scan(
    FilterExpression=Attr('status').eq('active'),
    Limit=100
)

# Full table scan with pagination
def scan_all_items(table_name):
    table = dynamodb.Table(table_name)
    items = []
    response = table.scan()

    while True:
        items.extend(response['Items'])

        if 'LastEvaluatedKey' not in response:
            break

        response = table.scan(
            ExclusiveStartKey=response['LastEvaluatedKey']
        )

    return items
```

## Global Secondary Index (GSI) Queries

```python
# Query a GSI
response = table.query(
    IndexName='email-index',
    KeyConditionExpression=Key('email').eq('user@example.com')
)
```

## Projection Expressions

Retrieve only specific attributes:

```python
# Get specific attributes only
response = table.get_item(
    Key={'pk': 'user-123'},
    ProjectionExpression='#n, email, #s',
    ExpressionAttributeNames={
        '#n': 'name',  # 'name' is reserved word
        '#s': 'status'
    }
)

# Query with projection
response = table.query(
    KeyConditionExpression=Key('pk').eq('user-123'),
    ProjectionExpression='pk, sk, title, created_at'
)
```

## Batch Operations

### Batch Get Items

```python
# Get multiple items across tables
response = dynamodb.batch_get_item(
    RequestItems={
        'YourTableName': {
            'Keys': [
                {'pk': 'user-123'},
                {'pk': 'user-456'},
                {'pk': 'user-789'}
            ]
        }
    }
)

items = response['Responses']['YourTableName']
```

## DynamoDB Data Types

DynamoDB uses specific type descriptors:

| Type | Descriptor | Python Type |
|------|------------|-------------|
| String | S | str |
| Number | N | Decimal |
| Binary | B | bytes |
| Boolean | BOOL | bool |
| Null | NULL | None |
| List | L | list |
| Map | M | dict |
| String Set | SS | set of str |
| Number Set | NS | set of Decimal |

When using the low-level client, types are explicit:

```python
# Low-level client response format
{
    'pk': {'S': 'user-123'},
    'age': {'N': '25'},
    'active': {'BOOL': True},
    'tags': {'SS': ['admin', 'user']}
}

# High-level resource (Table) auto-deserializes
{
    'pk': 'user-123',
    'age': Decimal('25'),
    'active': True,
    'tags': {'admin', 'user'}
}
```

## Pagination

Handle large result sets:

```python
def query_with_pagination(table, pk_value, page_size=100):
    """Query with pagination support."""
    items = []
    last_key = None

    while True:
        kwargs = {
            'KeyConditionExpression': Key('pk').eq(pk_value),
            'Limit': page_size
        }

        if last_key:
            kwargs['ExclusiveStartKey'] = last_key

        response = table.query(**kwargs)
        items.extend(response['Items'])

        last_key = response.get('LastEvaluatedKey')
        if not last_key:
            break

    return items
```

## Error Handling

```python
from botocore.exceptions import ClientError

try:
    response = table.get_item(Key={'pk': 'user-123'})
except ClientError as e:
    error_code = e.response['Error']['Code']

    if error_code == 'ResourceNotFoundException':
        print("Table not found")
    elif error_code == 'ProvisionedThroughputExceededException':
        print("Rate limit exceeded - implement backoff")
    elif error_code == 'ValidationException':
        print("Invalid request parameters")
    else:
        print(f"DynamoDB error: {error_code}")
        raise
```

## Docker Configuration

Mount AWS credentials into the container:

```yaml
# docker-compose.yml
services:
  backend:
    volumes:
      - ~/.aws:/root/.aws:ro
    environment:
      - AWS_DEFAULT_REGION=us-west-1
      # Optional: set AWS_PROFILE if not using default profile
```

Or use environment variables directly (non-SSO):

```yaml
services:
  backend:
    environment:
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - AWS_DEFAULT_REGION=us-west-1
```

## Important Notes

- Use `resource` (high-level API) for simpler code with auto type conversion
- Use `client` (low-level API) for operations like `describe_table`, `list_tables`
- Always specify `region_name` explicitly to avoid region mismatches
- Scan operations read the entire table - use queries when possible
- DynamoDB uses `Decimal` for numbers, not `float` (for precision)
- Reserved words (like `name`, `status`) require `ExpressionAttributeNames`
- Implement exponential backoff for `ProvisionedThroughputExceededException`
