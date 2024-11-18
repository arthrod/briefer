import { forwardRef, useCallback, useEffect, useState } from "react";
import styles from './index.module.scss';
import { parseSSEStream } from "@/hooks/mf/chat/useSSEMessage";
import { prop } from "ramda";

// 定义 SSE 块的类型
export interface IProps {
    content: string;
}

const RobotMessage = forwardRef((props: IProps, ref) => {
    // 用于存储块内容和类型
    const [blocks, setBlocks] = useState<{ type: string, content: string }[]>([]);
    let state = { currentType: null, currentContent: [] };
    const handleSSEMessage = useCallback((data: string) => {
        // 解析 SSE 流
        parseSSEStream(data, {
            onStart: (type) => {
                setBlocks((prevBlocks) => [...prevBlocks, { type, content: "" }]);
            },
            onContent: (content) => {
                // 更新最后一个块的内容
                setBlocks((prevBlocks) => {
                    const lastIndex = prevBlocks.length - 1;
                    const updatedBlocks = [...prevBlocks];
                    updatedBlocks[lastIndex].content = content;
                    return updatedBlocks;
                });
            },
            onEnd: () => {
                console.log("Block ended");
            },
            onClose: () => {
                state = { currentType: null, currentContent: [] };
            }
        }, state);
    }, []);

    // 每次 `content` 更新时处理 SSE 消息
    useEffect(() => {
        console.log(props.content)
        handleSSEMessage(props.content);
    }, [props.content]);

    // 渲染不同类型的块
    const renderBlock = (block: { type: string, content: string }) => {
        switch (block.type) {
            case "content":
                return <div className={styles.content}>{block.content}</div>;
            case "title":
                return <h3 className={styles.title}>{block.content}</h3>;
            case "json":
                const json = block.content.replaceAll('\'', '\"')
                // console.log(json)
                try {
                    const jsonData = JSON.parse(json);

                    return (
                        <div className={styles.jsonBlock}>
                            <pre>{JSON.stringify(jsonData, null, 2)}</pre>
                        </div>
                    );
                } catch (e) {
                    return <div className={styles.errorBlock}>Invalid JSON</div>;
                }
            default:
                return <div>{block.content}</div>;
        }
    };

    return (
        <div className={styles.robotMessage}>
            {blocks.map((block, index) => (
                <div key={index} className={styles.block}>
                    {renderBlock(block)}
                </div>
            ))}
        </div>
    );
});

export default RobotMessage;
