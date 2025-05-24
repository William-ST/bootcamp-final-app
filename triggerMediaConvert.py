import boto3
import os
import json

mediaconvert = boto3.client(
    'mediaconvert',
    region_name='us-east-1',
    endpoint_url=os.environ['MEDIACONVERT_ENDPOINT']
)

def lambda_handler(event, context):
    print("Received event:", json.dumps(event, indent=2))
    
    # Extraer bucket y archivo
    input_bucket = event['Records'][0]['s3']['bucket']['name']
    input_key = event['Records'][0]['s3']['object']['key']
    
    input_s3_url = f"s3://{input_bucket}/{input_key}"
    output_bucket = os.environ['MEDIA_BUCKET_OUTPUT']
    output_s3_path = f"s3://{output_bucket}/hls/{os.path.splitext(os.path.basename(input_key))[0]}/"

    # Crear el job
    job_settings = {
        "Role": os.environ['ROLE_ARN'],
        "Settings": {
            "TimecodeConfig": {"Source": "EMBEDDED"},
            "Inputs": [{
                "FileInput": input_s3_url,
                "AudioSelectors": {
                    "Audio Selector 1": {
                        "DefaultSelection": "DEFAULT"
                    }
                },
                "VideoSelector": {}
            }],
            "OutputGroups": [{
                "Name": "HLS Group",
                "OutputGroupSettings": {
                    "Type": "HLS_GROUP_SETTINGS",
                    "HlsGroupSettings": {
                        "Destination": output_s3_path,
                        "SegmentLength": 6,
                        "MinSegmentLength": 1,
                        "ManifestDurationFormat": "INTEGER",
                        "OutputSelection": "MANIFESTS_AND_SEGMENTS",
                        "StreamInfResolution": "INCLUDE",
                        "DirectoryStructure": "SINGLE_DIRECTORY",
                        "CaptionLanguageSetting": "OMIT"
                    }
                },
                "Outputs": [
                    {
                        "VideoDescription": {
                            "ScalingBehavior": "DEFAULT",
                            "TimecodeInsertion": "DISABLED",
                            "AntiAlias": "ENABLED",
                            "Sharpness": 50,
                            "CodecSettings": {
                                "Codec": "H_264",
                                "H264Settings": {
                                    "Bitrate": 500000,
                                    "RateControlMode": "CBR",
                                    "CodecProfile": "MAIN",
                                    "GopSize": 2,
                                    "GopSizeUnits": "SECONDS",
                                    "GopClosedCadence": 1,
                                    "InterlaceMode": "PROGRESSIVE",
                                    "NumberBFramesBetweenReferenceFrames": 2
                                }
                            },
                            "Height": 240,
                            "Width": 426
                        },
                        "AudioDescriptions": [{
                            "AudioTypeControl": "FOLLOW_INPUT",
                            "CodecSettings": {
                                "Codec": "AAC",
                                "AacSettings": {
                                    "Bitrate": 96000,
                                    "CodingMode": "CODING_MODE_2_0",
                                    "SampleRate": 48000
                                }
                            }
                        }],
                        "ContainerSettings": {
                            "Container": "M3U8",
                            "M3u8Settings": {
                                "AudioFramesPerPes": 4,
                                "PcrControl": "PCR_EVERY_PES_PACKET",
                                "PmtPid": 480,
                                "PrivateMetadataPid": 503,
                                "ProgramNumber": 1,
                                "PatInterval": 0,
                                "PmtInterval": 0,
                                "Scte35Source": "NONE",
                                "TimedMetadata": "NONE",
                                "VideoPid": 481
                            }
                        },
                        "NameModifier": "_240p"
                    },
                    {
                        "VideoDescription": {
                            "ScalingBehavior": "DEFAULT",
                            "TimecodeInsertion": "DISABLED",
                            "AntiAlias": "ENABLED",
                            "Sharpness": 50,
                            "CodecSettings": {
                                "Codec": "H_264",
                                "H264Settings": {
                                    "Bitrate": 3000000,
                                    "RateControlMode": "CBR",
                                    "CodecProfile": "MAIN",
                                    "GopSize": 2,
                                    "GopSizeUnits": "SECONDS",
                                    "GopClosedCadence": 1,
                                    "InterlaceMode": "PROGRESSIVE",
                                    "NumberBFramesBetweenReferenceFrames": 2
                                }
                            },
                            "Height": 720,
                            "Width": 1280
                        },
                        "AudioDescriptions": [{
                            "AudioTypeControl": "FOLLOW_INPUT",
                            "CodecSettings": {
                                "Codec": "AAC",
                                "AacSettings": {
                                    "Bitrate": 128000,
                                    "CodingMode": "CODING_MODE_2_0",
                                    "SampleRate": 48000
                                }
                            }
                        }],
                        "ContainerSettings": {
                            "Container": "M3U8",
                            "M3u8Settings": {
                                "AudioFramesPerPes": 4,
                                "PcrControl": "PCR_EVERY_PES_PACKET",
                                "PmtPid": 480,
                                "PrivateMetadataPid": 503,
                                "ProgramNumber": 1,
                                "PatInterval": 0,
                                "PmtInterval": 0,
                                "Scte35Source": "NONE",
                                "TimedMetadata": "NONE",
                                "VideoPid": 481
                            }
                        },
                        "NameModifier": "_720p"
                    }
                ]
            }]
        }
    }

    try:
        response = mediaconvert.create_job(**job_settings)
        print("MediaConvert job created:", response['Job']['Id'])
    except Exception as e:
        print("Error creating MediaConvert job:", e)
        raise

    return {
        "statusCode": 200,
        "body": json.dumps("HLS job created successfully!")
    }
