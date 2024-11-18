export type SSECallback = {
    onStart: (type: string) => void; // 解析到头部时触发
    onContent: (content: string) => void; // 解析到内容时触发
    onEnd: () => void; // 解析到结束标志时触发
    onClose: () => void;
};

export function parseSSEStream(input: string, callbacks: SSECallback,
    state: { currentType: string | null, currentContent: string[] }
) {
    const lines = input.split("\n");

    for (const line of lines) {
        const trimmedLine = line.trim();

        // 处理流结束的标志 [DONE]
        if (trimmedLine === "[DONE]") {
            callbacks.onClose();  // 触发关闭回调
            return;  // 处理结束，停止解析
        }

        // 处理每行以 data: 开头的数据
        const data = trimmedLine.trim();  // 去掉 data: 的部分

        if (data.startsWith("```")) {
            // 处理块开始或结束
            const type = data.slice(3).trim();  // 提取 ``` 后的类型
            if (!state.currentType && type) {
                // 检测到新的块开始
                state.currentType = type;
                state.currentContent = [];  // 清空上次的内容
                callbacks.onStart(state.currentType);  // 触发开始回调
            } else if (state.currentType && !type) {
                // 结束当前块
                callbacks.onContent(state.currentContent.join(""));  // 传递内容
                callbacks.onEnd();  // 触发结束回调
                state.currentType = null;
                state.currentContent = [];  // 清空当前内容
            }
        } else if (state.currentType) {
            // 当前在一个块中，积累内容
            state.currentContent.push(data);
            callbacks.onContent(data);  // 触发内容回调
        }
    }
}
