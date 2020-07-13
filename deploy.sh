set -e

yarn run build

aws s3 sync build/ s3://vuzic.app
aws cloudfront create-invalidation --distribution-id=`cat .aws-cloudfront-distro` --paths="/index.html"

